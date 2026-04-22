// Integration test for applyBuyMoreLooksFromCheckout. Covers the five
// documented behaviours: happy-path (styleboards+bonus increment, Payment
// row, PENDING_STYLEBOARD action), idempotent replay, amount-mismatch
// rejection, invalid quantity rejection, and missing metadata guard.

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import type Stripe from "stripe";
import { applyBuyMoreLooksFromCheckout } from "@/lib/payments/buy-more-looks.service";
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

afterEach(async () => {
  if (client) {
    await getPool().query(
      "DELETE FROM session_pending_actions WHERE session_id IN (SELECT id FROM sessions WHERE client_id = $1)",
      [client.id],
    );
    await getPool().query("DELETE FROM payments WHERE user_id = $1", [client.id]);
    await getPool().query("DELETE FROM sessions WHERE client_id = $1", [client.id]);
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
    [id, userId],
  );
  return id;
}

function fakeCheckoutSession(opts: {
  paymentIntentId: string;
  sessionId: string;
  userId: string;
  quantity: number;
  pricePerLookInCents?: number;
  amountPaid?: number;
}): Stripe.Checkout.Session {
  const unit = opts.pricePerLookInCents ?? 2000; // Mini plan add-on default
  const total = opts.amountPaid ?? unit * opts.quantity;
  return {
    id: `cs_test_bml_${opts.paymentIntentId}`,
    payment_intent: opts.paymentIntentId,
    amount_total: total,
    currency: "usd",
    metadata: {
      purpose: "BUY_MORE_LOOKS",
      userId: opts.userId,
      sessionId: opts.sessionId,
      quantity: String(opts.quantity),
      totalInCents: String(total),
    },
  } as unknown as Stripe.Checkout.Session;
}

async function readSession(id: string) {
  const { rows } = await getPool().query(
    `SELECT styleboards_allowed, bonus_boards_granted
     FROM sessions WHERE id = $1`,
    [id],
  );
  return rows[0] as
    | { styleboards_allowed: number; bonus_boards_granted: number }
    | undefined;
}

async function countPayments(sessionId: string) {
  const { rows } = await getPool().query(
    `SELECT COUNT(*)::int AS n FROM payments WHERE session_id = $1`,
    [sessionId],
  );
  return rows[0].n as number;
}

async function countOpenPendingStyleboards(sessionId: string) {
  const { rows } = await getPool().query(
    `SELECT COUNT(*)::int AS n FROM session_pending_actions
       WHERE session_id = $1 AND type = 'PENDING_STYLEBOARD' AND status = 'OPEN'`,
    [sessionId],
  );
  return rows[0].n as number;
}

test("applyBuyMoreLooksFromCheckout increments styleboardsAllowed + opens PENDING_STYLEBOARD", async () => {
  const suffix = randomUUID().slice(0, 8);
  client = await ensureClientUser({
    clerkId: `bml_${suffix}`,
    email: `bml-${suffix}@example.com`,
    firstName: "Buy",
    lastName: "Looks",
  });
  assertClient(client);
  const sessionId = await createMiniSession(client.id);

  await applyBuyMoreLooksFromCheckout(
    fakeCheckoutSession({
      paymentIntentId: `pi_bml_${suffix}_1`,
      sessionId,
      userId: client.id,
      quantity: 3, // 3 × $20 = $60
    }),
  );

  const after = await readSession(sessionId);
  assert.equal(after?.styleboards_allowed, 5); // 2 base + 3 bought
  assert.equal(after?.bonus_boards_granted, 3);
  assert.equal(await countPayments(sessionId), 1);
  assert.equal(await countOpenPendingStyleboards(sessionId), 1);
});

test("applyBuyMoreLooksFromCheckout is idempotent on duplicate PaymentIntent", async () => {
  const suffix = randomUUID().slice(0, 8);
  client = await ensureClientUser({
    clerkId: `bml_${suffix}`,
    email: `bml-${suffix}@example.com`,
    firstName: "Buy",
    lastName: "Looks",
  });
  assertClient(client);
  const sessionId = await createMiniSession(client.id);

  const event = fakeCheckoutSession({
    paymentIntentId: `pi_bml_${suffix}_dup`,
    sessionId,
    userId: client.id,
    quantity: 2,
  });

  await applyBuyMoreLooksFromCheckout(event);
  await applyBuyMoreLooksFromCheckout(event); // replay

  const after = await readSession(sessionId);
  assert.equal(after?.styleboards_allowed, 4); // 2 + 2, NOT 2 + 4
  assert.equal(after?.bonus_boards_granted, 2);
  assert.equal(await countPayments(sessionId), 1);
  assert.equal(await countOpenPendingStyleboards(sessionId), 1);
});

test("applyBuyMoreLooksFromCheckout rejects amount mismatch (tampered total)", async () => {
  const suffix = randomUUID().slice(0, 8);
  client = await ensureClientUser({
    clerkId: `bml_${suffix}`,
    email: `bml-${suffix}@example.com`,
    firstName: "Buy",
    lastName: "Looks",
  });
  assertClient(client);
  const sessionId = await createMiniSession(client.id);

  // metadata claims 3 × $20 = $6000 but amount_total is $100 (impossible).
  const tampered = {
    id: `cs_test_bml_bad_${suffix}`,
    payment_intent: `pi_bml_bad_${suffix}`,
    amount_total: 100, // much less than expected
    currency: "usd",
    metadata: {
      purpose: "BUY_MORE_LOOKS",
      userId: client.id,
      sessionId,
      quantity: "3",
      totalInCents: "6000",
    },
  } as unknown as Stripe.Checkout.Session;

  await applyBuyMoreLooksFromCheckout(tampered);

  const after = await readSession(sessionId);
  assert.equal(after?.styleboards_allowed, 2); // untouched
  assert.equal(after?.bonus_boards_granted, 0);
  assert.equal(await countPayments(sessionId), 0);
  assert.equal(await countOpenPendingStyleboards(sessionId), 0);
});

test("applyBuyMoreLooksFromCheckout rejects invalid quantity (zero)", async () => {
  const suffix = randomUUID().slice(0, 8);
  client = await ensureClientUser({
    clerkId: `bml_${suffix}`,
    email: `bml-${suffix}@example.com`,
    firstName: "Buy",
    lastName: "Looks",
  });
  assertClient(client);
  const sessionId = await createMiniSession(client.id);

  const invalid = {
    id: `cs_test_bml_q0_${suffix}`,
    payment_intent: `pi_bml_q0_${suffix}`,
    amount_total: 0,
    currency: "usd",
    metadata: {
      purpose: "BUY_MORE_LOOKS",
      userId: client.id,
      sessionId,
      quantity: "0",
      totalInCents: "0",
    },
  } as unknown as Stripe.Checkout.Session;

  await applyBuyMoreLooksFromCheckout(invalid);

  const after = await readSession(sessionId);
  assert.equal(after?.styleboards_allowed, 2);
  assert.equal(await countPayments(sessionId), 0);
});

test("applyBuyMoreLooksFromCheckout skips when metadata is missing", async () => {
  const suffix = randomUUID().slice(0, 8);
  client = await ensureClientUser({
    clerkId: `bml_${suffix}`,
    email: `bml-${suffix}@example.com`,
    firstName: "Buy",
    lastName: "Looks",
  });
  assertClient(client);
  const sessionId = await createMiniSession(client.id);

  const malformed = {
    id: `cs_test_bml_nm_${suffix}`,
    payment_intent: `pi_bml_nm_${suffix}`,
    amount_total: 4000,
    currency: "usd",
    metadata: {
      purpose: "BUY_MORE_LOOKS",
      userId: client.id,
      // sessionId intentionally omitted
      quantity: "2",
      totalInCents: "4000",
    },
  } as unknown as Stripe.Checkout.Session;

  await applyBuyMoreLooksFromCheckout(malformed);

  const after = await readSession(sessionId);
  assert.equal(after?.styleboards_allowed, 2);
  assert.equal(await countPayments(sessionId), 0);
});
