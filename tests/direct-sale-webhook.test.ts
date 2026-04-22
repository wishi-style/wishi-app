/**
 * Integration test for the direct-sale Stripe Checkout webhook path.
 *
 * Direct-sale orders are pre-created at checkout-create time as
 * `Order(status=PENDING)` carrying the cart snapshot. The webhook flips that
 * row to `ORDERED` via a conditional `updateMany` and clears the matching
 * cart items. These tests cover the money-sensitive bits:
 *   - PENDING → ORDERED transition with Stripe's authoritative tax/shipping.
 *   - Cart items consumed by the checkout get deleted.
 *   - Replay of the same `checkout.session.completed` is a no-op (the
 *     conditional update matches zero rows on the second pass).
 *   - Bails when the PENDING order is missing or metadata is missing.
 *
 * Runs against the shared wishi_p5 database (same as other integration tests).
 */

import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { applyDirectSaleFromCheckout } from "@/lib/payments/direct-sale.service";

const isIntegrationEnv =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL.includes("wishi_p5");

const integrationTest = isIntegrationEnv ? test : test.skip;

let clientUserId = "";
let sessionId = "";
const suiteSuffix = randomUUID().slice(0, 8);

before(async () => {
  if (!isIntegrationEnv) return;
  // Don't TRUNCATE shared tables — other integration tests in this suite
  // (lux-milestone, payout-dispatch, etc.) create their own users + sessions
  // in the same wishi_p5 DB. We use a unique per-suite email + referral code
  // so reruns don't collide.
  const client = await prisma.user.create({
    data: {
      email: `direct-sale-test-${suiteSuffix}@test.local`,
      firstName: "DS",
      lastName: "Tester",
      role: "CLIENT",
      referralCode: `DS${suiteSuffix.toUpperCase()}`,
    },
  });
  clientUserId = client.id;

  const session = await prisma.session.create({
    data: {
      clientId: clientUserId,
      planType: "MAJOR",
      amountPaidInCents: 13000,
      styleboardsAllowed: 3,
      status: "ACTIVE",
    },
  });
  sessionId = session.id;
});

beforeEach(async () => {
  if (!isIntegrationEnv || !clientUserId) return;
  // Scoped cleanup — only rows this suite owns. Cart items first (FK to user),
  // then orders (cascades to order_items via FK onDelete=Cascade).
  await prisma.cartItem.deleteMany({ where: { userId: clientUserId } });
  await prisma.order.deleteMany({ where: { userId: clientUserId } });
});

function mockCheckoutSession(overrides: Partial<Stripe.Checkout.Session>): Stripe.Checkout.Session {
  return {
    id: `cs_test_${randomUUID()}`,
    object: "checkout.session",
    amount_total: 10000,
    currency: "usd",
    payment_intent: `pi_test_${randomUUID()}`,
    metadata: {
      purpose: "DIRECT_SALE",
      userId: clientUserId,
      sessionId,
    },
    total_details: {
      amount_discount: 0,
      amount_shipping: 1000,
      amount_tax: 825,
    },
    collected_information: null,
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

async function seedPendingOrder(checkoutSessionId: string, opts: {
  inventoryProductId: string;
  quantity?: number;
  isPriorityShipping?: boolean;
}) {
  const cartItem = await prisma.cartItem.create({
    data: {
      userId: clientUserId,
      inventoryProductId: opts.inventoryProductId,
      sessionId,
      quantity: opts.quantity ?? 1,
    },
  });
  await prisma.order.create({
    data: {
      userId: clientUserId,
      sessionId,
      source: "DIRECT_SALE",
      status: "PENDING",
      retailer: "test-merchant",
      totalInCents: 0,
      isPriorityShipping: opts.isPriorityShipping ?? false,
      currency: "usd",
      stripeCheckoutSessionId: checkoutSessionId,
      items: {
        create: [
          {
            inventoryProductId: opts.inventoryProductId,
            title: "Test product",
            priceInCents: 5000,
            quantity: opts.quantity ?? 1,
          },
        ],
      },
    },
  });
  return cartItem;
}

integrationTest(
  "applyDirectSaleFromCheckout: flips PENDING → ORDERED + clears cart",
  async () => {
    const session = mockCheckoutSession({});
    await seedPendingOrder(session.id, { inventoryProductId: "inv_test_1", quantity: 2 });

    await applyDirectSaleFromCheckout(session);

    const orders = await prisma.order.findMany({ where: { userId: clientUserId } });
    assert.equal(orders.length, 1);
    assert.equal(orders[0].status, "ORDERED");
    assert.equal(orders[0].stripeCheckoutSessionId, session.id);
    assert.equal(orders[0].totalInCents, 10000);
    assert.equal(orders[0].taxInCents, 825);
    assert.equal(orders[0].shippingInCents, 1000);

    const remaining = await prisma.cartItem.findMany({ where: { userId: clientUserId } });
    assert.equal(remaining.length, 0);
  },
);

integrationTest("applyDirectSaleFromCheckout: idempotent on replay", async () => {
  const session = mockCheckoutSession({});
  await seedPendingOrder(session.id, { inventoryProductId: "inv_test_2" });

  await applyDirectSaleFromCheckout(session);
  await applyDirectSaleFromCheckout(session); // replay

  const orders = await prisma.order.findMany({
    where: { stripeCheckoutSessionId: session.id },
  });
  assert.equal(orders.length, 1);
  assert.equal(orders[0].status, "ORDERED");
});

integrationTest("applyDirectSaleFromCheckout: bails when no PENDING order exists", async () => {
  const session = mockCheckoutSession({}); // no seedPendingOrder()
  await applyDirectSaleFromCheckout(session);
  const orders = await prisma.order.findMany({
    where: { stripeCheckoutSessionId: session.id },
  });
  assert.equal(orders.length, 0);
});

integrationTest("applyDirectSaleFromCheckout: missing metadata is a no-op", async () => {
  const session = mockCheckoutSession({
    metadata: { purpose: "DIRECT_SALE" }, // missing userId/sessionId
  });
  await applyDirectSaleFromCheckout(session);
  const orders = await prisma.order.findMany({
    where: { stripeCheckoutSessionId: session.id },
  });
  assert.equal(orders.length, 0);
});

integrationTest(
  "applyDirectSaleFromCheckout: preserves isPriorityShipping=true for Lux orders",
  async () => {
    const session = mockCheckoutSession({
      total_details: {
        amount_discount: 0,
        amount_shipping: 0,
        amount_tax: 825,
      },
      amount_total: 9825,
    });
    await seedPendingOrder(session.id, {
      inventoryProductId: "inv_test_lux",
      isPriorityShipping: true,
    });

    await applyDirectSaleFromCheckout(session);

    const [order] = await prisma.order.findMany({
      where: { stripeCheckoutSessionId: session.id },
    });
    assert.equal(order.isPriorityShipping, true);
    assert.equal(order.shippingInCents, 0);
  },
);
