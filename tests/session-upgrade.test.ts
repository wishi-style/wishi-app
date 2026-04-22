// Integration test for applyUpgradeFromCheckout — the webhook path is
// finance-sensitive, so we cover: happy path, duplicate PaymentIntent
// (idempotent), already-upgraded session (guarded against double-apply),
// and missing metadata.

import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import type Stripe from "stripe";
import { applyUpgradeFromCheckout } from "@/lib/payments/session-upgrade.service";
import {
  cleanupE2EUserByEmail,
  ensureClientUser,
  getPool,
} from "./e2e/db";

type Client = { id: string; email: string };
let client: Client | null = null;

function assertClient(c: Client | null): asserts c is Client {
  if (!c) throw new Error("test fixture not initialized");
}

before(async () => {
  const { rows } = await getPool().query("SELECT type FROM plans");
  if (rows.length === 0) {
    throw new Error("Plans table is empty — run `npx tsx prisma/seed.ts` first");
  }
});

afterEach(async () => {
  if (client) {
    await getPool().query(
      "DELETE FROM payments WHERE user_id = $1",
      [client.id]
    );
    await getPool().query(
      "DELETE FROM sessions WHERE client_id = $1",
      [client.id]
    );
    await cleanupE2EUserByEmail(client.email);
    client = null;
  }
});

async function createMiniSession(userId: string) {
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO sessions
       (id, client_id, plan_type, status, amount_paid_in_cents,
        moodboards_allowed, styleboards_allowed, created_at, updated_at)
     VALUES ($1, $2, 'MINI', 'ACTIVE', 6000, 1, 2, NOW(), NOW())`,
    [id, userId]
  );
  return id;
}

function fakeCheckoutSession(opts: {
  paymentIntentId: string;
  sessionId: string;
  userId: string;
  fromPlan: string;
  toPlan: string;
  amountPaid: number;
}): Stripe.Checkout.Session {
  return {
    id: `cs_test_${opts.paymentIntentId}`,
    payment_intent: opts.paymentIntentId,
    amount_total: opts.amountPaid,
    currency: "usd",
    metadata: {
      purpose: "UPGRADE",
      userId: opts.userId,
      sessionId: opts.sessionId,
      fromPlanType: opts.fromPlan,
      toPlanType: opts.toPlan,
    },
  } as unknown as Stripe.Checkout.Session;
}

async function readSession(id: string) {
  const { rows } = await getPool().query(
    `SELECT plan_type, styleboards_allowed, amount_paid_in_cents, upgraded_from_plan_type
     FROM sessions WHERE id = $1`,
    [id]
  );
  return rows[0] as
    | {
        plan_type: string;
        styleboards_allowed: number;
        amount_paid_in_cents: number;
        upgraded_from_plan_type: string | null;
      }
    | undefined;
}

async function countPayments(sessionId: string) {
  const { rows } = await getPool().query(
    `SELECT COUNT(*)::int AS n FROM payments WHERE session_id = $1`,
    [sessionId]
  );
  return rows[0].n as number;
}

test("applyUpgradeFromCheckout upgrades MINI→MAJOR and writes Payment", async () => {
  const suffix = randomUUID().slice(0, 8);
  client = await ensureClientUser({
    clerkId: `upg_${suffix}`,
    email: `upg-${suffix}@example.com`,
    firstName: "Up",
    lastName: "Grade",
  });
  assertClient(client);
  const sessionId = await createMiniSession(client.id);

  await applyUpgradeFromCheckout(
    fakeCheckoutSession({
      paymentIntentId: `pi_test_${suffix}_1`,
      sessionId,
      userId: client.id,
      fromPlan: "MINI",
      toPlan: "MAJOR",
      amountPaid: 7000, // $130 - $60 delta
    })
  );

  const after = await readSession(sessionId);
  assert.equal(after?.plan_type, "MAJOR");
  assert.equal(after?.styleboards_allowed, 5); // Major = 5 boards
  assert.equal(after?.amount_paid_in_cents, 13000); // 6000 + 7000
  assert.equal(after?.upgraded_from_plan_type, "MINI");
  assert.equal(await countPayments(sessionId), 1);
});

test("applyUpgradeFromCheckout is idempotent on duplicate PaymentIntent", async () => {
  const suffix = randomUUID().slice(0, 8);
  client = await ensureClientUser({
    clerkId: `upg_${suffix}`,
    email: `upg-${suffix}@example.com`,
    firstName: "Up",
    lastName: "Grade",
  });
  assertClient(client);
  const sessionId = await createMiniSession(client.id);
  const pi = `pi_test_${suffix}_dup`;

  const event = fakeCheckoutSession({
    paymentIntentId: pi,
    sessionId,
    userId: client.id,
    fromPlan: "MINI",
    toPlan: "MAJOR",
    amountPaid: 7000,
  });

  await applyUpgradeFromCheckout(event);
  await applyUpgradeFromCheckout(event); // replay

  const after = await readSession(sessionId);
  assert.equal(after?.plan_type, "MAJOR");
  assert.equal(after?.amount_paid_in_cents, 13000); // NOT 20000 — single apply
  assert.equal(await countPayments(sessionId), 1);
});

test("applyUpgradeFromCheckout does NOT re-upgrade if session already advanced past fromPlan", async () => {
  const suffix = randomUUID().slice(0, 8);
  client = await ensureClientUser({
    clerkId: `upg_${suffix}`,
    email: `upg-${suffix}@example.com`,
    firstName: "Up",
    lastName: "Grade",
  });
  assertClient(client);
  const sessionId = await createMiniSession(client.id);

  // First upgrade applies cleanly.
  await applyUpgradeFromCheckout(
    fakeCheckoutSession({
      paymentIntentId: `pi_test_${suffix}_a`,
      sessionId,
      userId: client.id,
      fromPlan: "MINI",
      toPlan: "MAJOR",
      amountPaid: 7000,
    })
  );

  // Second event with a DIFFERENT PaymentIntent but same fromPlan=MINI
  // (e.g. user created two Checkouts, both paid). Session is no longer MINI,
  // so session mutation is skipped — but a Payment is still recorded for
  // reconciliation.
  await applyUpgradeFromCheckout(
    fakeCheckoutSession({
      paymentIntentId: `pi_test_${suffix}_b`,
      sessionId,
      userId: client.id,
      fromPlan: "MINI",
      toPlan: "LUX",
      amountPaid: 49000,
    })
  );

  const after = await readSession(sessionId);
  // Session stays at MAJOR — not clobbered to LUX.
  assert.equal(after?.plan_type, "MAJOR");
  assert.equal(after?.styleboards_allowed, 5);
  // Two Payments: one for the applied upgrade, one for the rejected duplicate.
  assert.equal(await countPayments(sessionId), 2);
});

test("applyUpgradeFromCheckout skips when metadata is missing fromPlanType", async () => {
  const suffix = randomUUID().slice(0, 8);
  client = await ensureClientUser({
    clerkId: `upg_${suffix}`,
    email: `upg-${suffix}@example.com`,
    firstName: "Up",
    lastName: "Grade",
  });
  assertClient(client);
  const sessionId = await createMiniSession(client.id);

  const malformed = {
    id: `cs_test_bad_${suffix}`,
    payment_intent: `pi_test_${suffix}_bad`,
    amount_total: 7000,
    currency: "usd",
    metadata: {
      purpose: "UPGRADE",
      userId: client.id,
      sessionId,
      // fromPlanType intentionally omitted
      toPlanType: "MAJOR",
    },
  } as unknown as Stripe.Checkout.Session;

  await applyUpgradeFromCheckout(malformed);

  const after = await readSession(sessionId);
  assert.equal(after?.plan_type, "MINI"); // untouched
  assert.equal(await countPayments(sessionId), 0);
});
