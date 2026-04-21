// Integration test for src/lib/payments/payout-webhooks.ts.
// Seeds a PROCESSING Payout + minimal Stripe transfer payload, invokes the
// handler, asserts the status flip.

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
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

afterEach(async () => {
  if (client?.id) {
    await getPool().query(
      "DELETE FROM payouts WHERE session_id IN (SELECT id FROM sessions WHERE client_id = $1)",
      [client.id]
    );
    await getPool().query(
      "DELETE FROM payments WHERE user_id = $1",
      [client.id]
    );
    await cleanupE2EUserByEmail(`pwh-client-${client.id}@example.com`);
  }
  if (stylist?.id) {
    await getPool().query("DELETE FROM stylist_profiles WHERE user_id = $1", [stylist.id]);
    await cleanupE2EUserByEmail(`pwh-stylist-${stylist.id}@example.com`);
  }
});

async function setupProcessingPayout(trigger = "SESSION_COMPLETED", stripeTransferId = "tr_test_123") {
  const suffix = randomUUID().slice(0, 8);
  client = await ensureClientUser({
    clerkId: `pwh_c_${suffix}`,
    email: `pwh-client-${suffix}@example.com`,
    firstName: "Web",
    lastName: "Hook",
  });
  stylist = await ensureStylistUser({
    clerkId: `pwh_s_${suffix}`,
    email: `pwh-stylist-${suffix}@example.com`,
    firstName: "Web",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });
  const { rows: profileRows } = await getPool().query(
    `UPDATE stylist_profiles SET stripe_connect_id = $1, payouts_enabled = true WHERE user_id = $2 RETURNING id`,
    [`acct_${suffix}`, stylist.id]
  );
  const stylistProfileId = profileRows[0].id;

  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    planType: "MAJOR",
    status: "COMPLETED",
    amountPaidInCents: 13000,
  });

  const payoutId = randomUUID();
  await getPool().query(
    `INSERT INTO payouts (id, stylist_profile_id, session_id, trigger, amount_in_cents, tip_in_cents, status, stripe_transfer_id, triggered_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4::"PayoutTrigger", 9100, 0, 'PROCESSING', $5, NOW(), NOW(), NOW())`,
    [payoutId, stylistProfileId, session.id, trigger, stripeTransferId]
  );
  return { sessionId: session.id, stylistProfileId, payoutId, stripeTransferId };
}

test("transfer.paid flips PROCESSING → COMPLETED + sets reconciledAt", async () => {
  const { handleTransferPaid } = await import("@/lib/payments/payout-webhooks");
  const { stripeTransferId } = await setupProcessingPayout("SESSION_COMPLETED", `tr_${randomUUID().slice(0, 8)}`);

  await handleTransferPaid({ id: stripeTransferId } as never);

  const { rows } = await getPool().query(
    "SELECT status, reconciled_at FROM payouts WHERE stripe_transfer_id = $1",
    [stripeTransferId]
  );
  assert.equal(rows[0].status, "COMPLETED");
  assert.ok(rows[0].reconciled_at instanceof Date);
});

test("transfer.failed flips PROCESSING → FAILED", async () => {
  const { handleTransferFailed } = await import("@/lib/payments/payout-webhooks");
  const { stripeTransferId } = await setupProcessingPayout("SESSION_COMPLETED", `tr_${randomUUID().slice(0, 8)}`);

  await handleTransferFailed({ id: stripeTransferId } as never);

  const { rows } = await getPool().query(
    "SELECT status, skipped_reason FROM payouts WHERE stripe_transfer_id = $1",
    [stripeTransferId]
  );
  assert.equal(rows[0].status, "FAILED");
  assert.equal(rows[0].skipped_reason, "stripe_transfer_failed");
});

test("transfer.paid for unknown transfer is a no-op", async () => {
  const { handleTransferPaid } = await import("@/lib/payments/payout-webhooks");
  // Should not throw
  await handleTransferPaid({ id: "tr_does_not_exist" } as never);
});

test("account.updated flips payouts_enabled + advances onboarding status", async () => {
  const { handleAccountUpdated } = await import("@/lib/payments/payout-webhooks");
  const { stylistProfileId } = await setupProcessingPayout();

  await handleAccountUpdated({
    id: "acct_whatever",
    charges_enabled: true,
    payouts_enabled: true,
    metadata: { stylistProfileId },
  } as never);

  const { rows } = await getPool().query(
    "SELECT payouts_enabled, onboarding_status FROM stylist_profiles WHERE id = $1",
    [stylistProfileId]
  );
  assert.equal(rows[0].payouts_enabled, true);
  assert.equal(rows[0].onboarding_status, "STRIPE_CONNECTED");
});

test("account.updated doesn't override AWAITING_ELIGIBILITY/ELIGIBLE status", async () => {
  const { handleAccountUpdated } = await import("@/lib/payments/payout-webhooks");
  const { stylistProfileId } = await setupProcessingPayout();
  await getPool().query(
    "UPDATE stylist_profiles SET onboarding_status = 'ELIGIBLE' WHERE id = $1",
    [stylistProfileId]
  );

  await handleAccountUpdated({
    id: "acct_existing",
    charges_enabled: true,
    payouts_enabled: true,
    metadata: { stylistProfileId },
  } as never);

  const { rows } = await getPool().query(
    "SELECT onboarding_status FROM stylist_profiles WHERE id = $1",
    [stylistProfileId]
  );
  assert.equal(rows[0].onboarding_status, "ELIGIBLE");
});

test("tip payment_intent.succeeded writes Payment(type=TIP) + Session.tipInCents idempotently", async () => {
  const { handleTipPaymentSucceeded } = await import("@/lib/payments/payout-webhooks");
  const { sessionId } = await setupProcessingPayout();
  const piId = `pi_tip_${randomUUID().slice(0, 8)}`;

  await handleTipPaymentSucceeded({
    id: piId,
    amount: 2600,
    currency: "usd",
    metadata: { sessionId, purpose: "tip" },
  } as never);

  // Second delivery of the same event — should not create a duplicate Payment row.
  await handleTipPaymentSucceeded({
    id: piId,
    amount: 2600,
    currency: "usd",
    metadata: { sessionId, purpose: "tip" },
  } as never);

  const pRows = (
    await getPool().query("SELECT * FROM payments WHERE stripe_payment_intent_id = $1", [piId])
  ).rows;
  assert.equal(pRows.length, 1);
  assert.equal(pRows[0].type, "TIP");
  assert.equal(pRows[0].amount_in_cents, 2600);

  const sRows = (
    await getPool().query("SELECT tip_in_cents, stripe_tip_payment_id FROM sessions WHERE id = $1", [sessionId])
  ).rows;
  assert.equal(sRows[0].tip_in_cents, 2600);
  assert.equal(sRows[0].stripe_tip_payment_id, piId);
});

test("payment_intent without purpose=tip is ignored", async () => {
  const { handleTipPaymentSucceeded } = await import("@/lib/payments/payout-webhooks");
  const { sessionId } = await setupProcessingPayout();
  await handleTipPaymentSucceeded({
    id: "pi_other",
    amount: 1000,
    currency: "usd",
    metadata: { sessionId, purpose: "something_else" },
  } as never);
  const { rows } = await getPool().query(
    "SELECT COUNT(*)::int AS c FROM payments WHERE session_id = $1 AND type = 'TIP'",
    [sessionId]
  );
  assert.equal(rows[0].c, 0);
});
