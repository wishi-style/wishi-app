// Integration test for src/lib/payouts/dispatch.service.ts.
// Uses the same local Postgres as the E2E suite, but drives the SUT directly
// (no browser). Stripe is swapped via the `deps.createTransfer` seam.

import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import {
  cleanupE2EUserByEmail,
  ensureClientUser,
  ensureStylistUser,
  ensureStylistProfile,
  createSessionForClient,
  getPool,
} from "./e2e/db";

let client: { id: string };
let stylist: { id: string };

// Ensure plans are seeded once.
before(async () => {
  const pool = getPool();
  const { rows } = await pool.query("SELECT type FROM plans");
  if (rows.length === 0) {
    throw new Error("Plans table is empty — run `npx tsx prisma/seed.ts` first");
  }
});

afterEach(async () => {
  if (client?.id) {
    await getPool().query("DELETE FROM payouts WHERE session_id IN (SELECT id FROM sessions WHERE client_id = $1)", [
      client.id,
    ]);
    await cleanupE2EUserByEmail(`payout-client-${client.id}@example.com`);
  }
  if (stylist?.id) {
    await getPool().query("DELETE FROM stylist_profiles WHERE user_id = $1", [stylist.id]);
    await cleanupE2EUserByEmail(`payout-stylist-${stylist.id}@example.com`);
  }
});

async function setupFixtures(opts: {
  planType: "MINI" | "MAJOR" | "LUX";
  stylistType: "PLATFORM" | "IN_HOUSE";
  stripeConnectId?: string | null;
  payoutsEnabled?: boolean;
  tipInCents?: number;
}) {
  const suffix = randomUUID().slice(0, 8);
  client = await ensureClientUser({
    clerkId: `payout_c_${suffix}`,
    email: `payout-client-${suffix}@example.com`,
    firstName: "Pay",
    lastName: "Client",
  });
  stylist = await ensureStylistUser({
    clerkId: `payout_s_${suffix}`,
    email: `payout-stylist-${suffix}@example.com`,
    firstName: "Pay",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });
  await getPool().query(
    `UPDATE stylist_profiles SET stylist_type = $1, stripe_connect_id = $2, payouts_enabled = $3 WHERE user_id = $4`,
    [opts.stylistType, opts.stripeConnectId ?? null, opts.payoutsEnabled ?? false, stylist.id]
  );

  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    planType: opts.planType,
    status: "ACTIVE",
    amountPaidInCents:
      opts.planType === "MINI" ? 6000 : opts.planType === "MAJOR" ? 13000 : 55000,
  });
  if (opts.tipInCents) {
    await getPool().query("UPDATE sessions SET tip_in_cents = $1 WHERE id = $2", [
      opts.tipInCents,
      session.id,
    ]);
  }
  return { sessionId: session.id };
}

async function loadPayout(sessionId: string, trigger: string) {
  const { rows } = await getPool().query(
    "SELECT * FROM payouts WHERE session_id = $1 AND trigger = $2",
    [sessionId, trigger]
  );
  return rows[0];
}

test("IN_HOUSE stylist: writes SKIPPED, no Stripe call", async () => {
  const { dispatchPayout } = await import("@/lib/payouts/dispatch.service");
  const { sessionId } = await setupFixtures({
    planType: "MAJOR",
    stylistType: "IN_HOUSE",
  });

  let transferCalled = false;
  const res = await dispatchPayout({
    sessionId,
    trigger: "SESSION_COMPLETED",
    deps: {
      createTransfer: async () => {
        transferCalled = true;
        throw new Error("should not be called");
      },
    },
  });

  assert.equal(res.status, "CREATED");
  assert.equal(transferCalled, false);
  const row = await loadPayout(sessionId, "SESSION_COMPLETED");
  assert.equal(row.status, "SKIPPED");
  assert.equal(row.skipped_reason, "in_house_stylist");
  // 70% of 13000 + 0 tip
  assert.equal(row.amount_in_cents, 9100);
});

test("PLATFORM + Connect not ready: writes PENDING with connect_not_ready, no Stripe call", async () => {
  const { dispatchPayout } = await import("@/lib/payouts/dispatch.service");
  const { sessionId } = await setupFixtures({
    planType: "MINI",
    stylistType: "PLATFORM",
    stripeConnectId: null,
    payoutsEnabled: false,
  });

  let transferCalled = false;
  await dispatchPayout({
    sessionId,
    trigger: "SESSION_COMPLETED",
    deps: {
      createTransfer: async () => {
        transferCalled = true;
        throw new Error("should not be called");
      },
    },
  });

  assert.equal(transferCalled, false);
  const row = await loadPayout(sessionId, "SESSION_COMPLETED");
  assert.equal(row.status, "PENDING");
  assert.equal(row.skipped_reason, "connect_not_ready");
});

test("PLATFORM happy path: PENDING → PROCESSING after transfer", async () => {
  const { dispatchPayout } = await import("@/lib/payouts/dispatch.service");
  const { sessionId } = await setupFixtures({
    planType: "MAJOR",
    stylistType: "PLATFORM",
    stripeConnectId: "acct_test_123",
    payoutsEnabled: true,
    tipInCents: 2600,
  });

  const res = await dispatchPayout({
    sessionId,
    trigger: "SESSION_COMPLETED",
    deps: {
      createTransfer: async () => ({ id: "tr_fake_abc" }) as never,
    },
  });
  assert.equal(res.status, "CREATED");

  const row = await loadPayout(sessionId, "SESSION_COMPLETED");
  assert.equal(row.status, "PROCESSING");
  assert.equal(row.stripe_transfer_id, "tr_fake_abc");
  assert.equal(row.amount_in_cents, 11700); // 70% × 13000 + 2600 tip
});

test("idempotent: second call for same (sessionId, trigger) returns SKIPPED", async () => {
  const { dispatchPayout } = await import("@/lib/payouts/dispatch.service");
  const { sessionId } = await setupFixtures({
    planType: "MINI",
    stylistType: "PLATFORM",
    stripeConnectId: "acct_test_123",
    payoutsEnabled: true,
  });

  let transferCalls = 0;
  const transferImpl = async () => {
    transferCalls += 1;
    return { id: `tr_fake_${transferCalls}` } as never;
  };

  const first = await dispatchPayout({
    sessionId,
    trigger: "SESSION_COMPLETED",
    deps: { createTransfer: transferImpl },
  });
  const second = await dispatchPayout({
    sessionId,
    trigger: "SESSION_COMPLETED",
    deps: { createTransfer: transferImpl },
  });

  assert.equal(first.status, "CREATED");
  assert.deepEqual(second, { status: "SKIPPED", reason: "idempotent" });
  assert.equal(transferCalls, 1);
});

test("Stripe transfer failure: row flips to FAILED", async () => {
  const { dispatchPayout } = await import("@/lib/payouts/dispatch.service");
  const { sessionId } = await setupFixtures({
    planType: "MINI",
    stylistType: "PLATFORM",
    stripeConnectId: "acct_test_123",
    payoutsEnabled: true,
  });

  await dispatchPayout({
    sessionId,
    trigger: "SESSION_COMPLETED",
    deps: {
      createTransfer: async () => {
        throw new Error("Stripe is down");
      },
    },
  });

  const row = await loadPayout(sessionId, "SESSION_COMPLETED");
  assert.equal(row.status, "FAILED");
  assert.equal(row.skipped_reason, "stripe_transfer_error");
});

test("Lux LUX_FINAL amount = (70% × 55000) - 13500 milestone + tip", async () => {
  const { dispatchPayout } = await import("@/lib/payouts/dispatch.service");
  const { sessionId } = await setupFixtures({
    planType: "LUX",
    stylistType: "PLATFORM",
    stripeConnectId: "acct_test_lux",
    payoutsEnabled: true,
    tipInCents: 11000,
  });

  await dispatchPayout({
    sessionId,
    trigger: "LUX_FINAL",
    deps: { createTransfer: async () => ({ id: "tr_lux_final" }) as never },
  });
  const row = await loadPayout(sessionId, "LUX_FINAL");
  assert.equal(row.status, "PROCESSING");
  assert.equal(row.amount_in_cents, 36000);
  assert.equal(row.tip_in_cents, 11000);
});

test("Lux LUX_THIRD_LOOK amount = milestone only, no tip", async () => {
  const { dispatchPayout } = await import("@/lib/payouts/dispatch.service");
  const { sessionId } = await setupFixtures({
    planType: "LUX",
    stylistType: "PLATFORM",
    stripeConnectId: "acct_test_lux",
    payoutsEnabled: true,
    tipInCents: 5000,
  });

  await dispatchPayout({
    sessionId,
    trigger: "LUX_THIRD_LOOK",
    deps: { createTransfer: async () => ({ id: "tr_lux_3" }) as never },
  });
  const row = await loadPayout(sessionId, "LUX_THIRD_LOOK");
  assert.equal(row.amount_in_cents, 13500);
  assert.equal(row.tip_in_cents, 0);
});
