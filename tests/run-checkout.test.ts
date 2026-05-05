// Integration test for src/lib/payments/run-checkout.ts.
//
// The bug this guards against: prior versions of this code path gated the
// Stripe-bypass on isE2EAuthModeEnabled() (env-wide). Staging runs with
// E2E_AUTH_MODE=true so Playwright works, which meant every real Clerk
// signup on staging silently skipped Stripe and got a free synthetic
// SUCCEEDED Payment row. The discriminator must instead be auth.isE2E,
// which is set per-request only when the /sign-in?e2e=1 backdoor cookie
// is present.

import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";

import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
} from "./e2e/db";
import { runCheckout } from "@/lib/payments/run-checkout";

let client: { id: string; clerk_id: string };
let stylistUser: { id: string };
let stylistProfile: { id: string };

let clientEmail = "";
let stylistEmail = "";

before(async () => {
  const pool = getPool();
  const { rows } = await pool.query("SELECT type FROM plans");
  if (rows.length === 0) {
    throw new Error(
      "Plans table is empty — run `npx tsx prisma/seed.ts` first",
    );
  }
});

afterEach(async () => {
  if (clientEmail) await cleanupE2EUserByEmail(clientEmail);
  if (stylistUser?.id) {
    await cleanupStylistProfile(stylistUser.id);
    await cleanupE2EUserByEmail(stylistEmail);
  }
  clientEmail = "";
  stylistEmail = "";
});

async function setupFixtures() {
  const id = randomUUID().slice(0, 8);
  clientEmail = `run-checkout-c-${id}@e2e.wishi.test`;
  stylistEmail = `run-checkout-s-${id}@e2e.wishi.test`;

  client = await ensureClientUser({
    clerkId: `e2e_run_checkout_c_${id}`,
    email: clientEmail,
    firstName: "Run",
    lastName: "Checkout",
  });
  stylistUser = await ensureStylistUser({
    clerkId: `e2e_run_checkout_s_${id}`,
    email: stylistEmail,
    firstName: "Run",
    lastName: "Stylist",
  });
  stylistProfile = await ensureStylistProfile({ userId: stylistUser.id });
}

test("real Clerk user (isE2E=false) hits Stripe, not the e2e bypass", async () => {
  await setupFixtures();

  let provisionCalls = 0;
  const stripeCalls: Array<unknown> = [];

  const fd = new FormData();
  fd.set("planType", "MINI");
  fd.set("stylistId", stylistProfile.id);
  fd.set("isSubscription", "false");

  const outcome = await runCheckout({
    auth: { userId: client.clerk_id, isE2E: false },
    formData: fd,
    appUrl: "https://wishi.me",
    deps: {
      provisionSessionForE2E: async () => {
        provisionCalls++;
        return { sessionId: "should-not-be-called" };
      },
      createOneTimeCheckout: async (opts) => {
        stripeCalls.push(opts);
        return {
          id: "cs_test_real_clerk",
          url: "https://checkout.stripe.com/c/pay/cs_test_real_clerk",
        };
      },
    },
  });

  assert.equal(
    provisionCalls,
    0,
    "REGRESSION: real Clerk user hit the e2e bypass path",
  );
  assert.equal(stripeCalls.length, 1, "Stripe checkout should be called once");
  assert.equal(outcome.kind, "redirect-to-stripe");
  if (outcome.kind === "redirect-to-stripe") {
    assert.match(outcome.url, /^https:\/\/checkout\.stripe\.com/);
  }

  // Side-effect check: no synthetic Session/Payment rows written for this user.
  const sessions = await getPool().query(
    `SELECT id FROM sessions WHERE client_id = $1`,
    [client.id],
  );
  assert.equal(
    sessions.rowCount,
    0,
    "no Session row should exist — Stripe webhook will write it after the real charge",
  );
  const payments = await getPool().query(
    `SELECT id FROM payments WHERE user_id = $1`,
    [client.id],
  );
  assert.equal(payments.rowCount, 0, "no synthetic Payment row should exist");
});

test("real Clerk user, subscription plan: routes to Stripe subscription checkout", async () => {
  await setupFixtures();

  let oneTimeCalls = 0;
  let subscriptionCalls = 0;

  const fd = new FormData();
  fd.set("planType", "MAJOR");
  fd.set("stylistId", stylistProfile.id);
  fd.set("isSubscription", "true");

  const outcome = await runCheckout({
    auth: { userId: client.clerk_id, isE2E: false },
    formData: fd,
    appUrl: "https://wishi.me",
    deps: {
      provisionSessionForE2E: async () => {
        throw new Error("must not be called");
      },
      createOneTimeCheckout: async () => {
        oneTimeCalls++;
        return { id: "wrong", url: null };
      },
      createSubscriptionCheckout: async () => {
        subscriptionCalls++;
        return {
          id: "cs_test_sub",
          url: "https://checkout.stripe.com/c/pay/cs_test_sub",
        };
      },
    },
  });

  assert.equal(oneTimeCalls, 0);
  assert.equal(subscriptionCalls, 1);
  assert.equal(outcome.kind, "redirect-to-stripe");
});

test("e2e backdoor user (isE2E=true) takes the bypass path", async () => {
  await setupFixtures();

  let provisionedWith: unknown = null;
  let stripeCalls = 0;

  const fd = new FormData();
  fd.set("planType", "MAJOR");
  fd.set("stylistId", stylistProfile.id);
  fd.set("isSubscription", "false");

  const outcome = await runCheckout({
    auth: { userId: client.clerk_id, isE2E: true },
    formData: fd,
    appUrl: "https://wishi.me",
    deps: {
      provisionSessionForE2E: async (opts) => {
        provisionedWith = opts;
        return { sessionId: "synthetic-sid" };
      },
      createOneTimeCheckout: async () => {
        stripeCalls++;
        return { id: "wrong", url: null };
      },
      createSubscriptionCheckout: async () => {
        stripeCalls++;
        return { id: "wrong", url: null };
      },
    },
  });

  assert.equal(stripeCalls, 0, "Stripe must not be called for e2e users");
  assert.deepEqual(provisionedWith, {
    userId: client.id,
    planType: "MAJOR",
    stylistUserId: stylistUser.id,
    isSubscription: false,
  });
  assert.equal(outcome.kind, "e2e-provisioned");
});

test("missing auth.userId throws Not authenticated", async () => {
  const fd = new FormData();
  fd.set("planType", "MINI");
  fd.set("isSubscription", "false");

  await assert.rejects(
    () =>
      runCheckout({
        auth: { userId: null, isE2E: false },
        formData: fd,
        appUrl: "https://wishi.me",
      }),
    /Not authenticated/,
  );
});

test("invalid plan type throws", async () => {
  await setupFixtures();

  const fd = new FormData();
  fd.set("planType", "BOGUS");
  fd.set("isSubscription", "false");

  await assert.rejects(
    () =>
      runCheckout({
        auth: { userId: client.clerk_id, isE2E: false },
        formData: fd,
        appUrl: "https://wishi.me",
      }),
    /Invalid plan type/,
  );
});

test("LUX subscription combination throws", async () => {
  await setupFixtures();

  const fd = new FormData();
  fd.set("planType", "LUX");
  fd.set("isSubscription", "true");

  await assert.rejects(
    () =>
      runCheckout({
        auth: { userId: client.clerk_id, isE2E: false },
        formData: fd,
        appUrl: "https://wishi.me",
      }),
    /Lux plan is one-time only/,
  );
});
