/**
 * Integration test for the direct-sale Stripe Checkout webhook path.
 *
 * Covers the money-sensitive bits:
 *   - `checkout.session.completed` with metadata.purpose=DIRECT_SALE creates
 *     an Order(source=DIRECT_SALE, status=ORDERED) with Stripe's authoritative
 *     tax + shipping totals.
 *   - Cart items consumed by the checkout get deleted.
 *   - `Order.stripeCheckoutSessionId` unique keeps the handler idempotent
 *     when Stripe redelivers the event.
 *   - `applyDirectSaleFromCheckout` is a no-op when metadata is missing.
 *
 * Runs against the shared wishi_p5 database (same as other integration tests).
 */

import assert from "node:assert/strict";
import test, { before, beforeEach, after } from "node:test";
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

before(async () => {
  if (!isIntegrationEnv) return;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE cart_items, order_items, orders, sessions, users RESTART IDENTITY CASCADE`,
  );
  const client = await prisma.user.create({
    data: {
      email: "direct-sale-test@test.local",
      firstName: "DS",
      lastName: "Tester",
      role: "CLIENT",
      referralCode: "DSTEST",
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
  if (!isIntegrationEnv) return;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE cart_items, order_items, orders RESTART IDENTITY CASCADE`,
  );
});

after(async () => {
  if (!isIntegrationEnv) return;
  await prisma.$disconnect();
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
      cartItemIds: "",
      isPriorityShipping: "false",
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

integrationTest("applyDirectSaleFromCheckout: creates Order + deletes CartItems", async () => {
  const cartItem = await prisma.cartItem.create({
    data: {
      userId: clientUserId,
      inventoryProductId: "inv_test_1",
      sessionId,
      quantity: 2,
    },
  });

  const session = mockCheckoutSession({
    metadata: {
      purpose: "DIRECT_SALE",
      userId: clientUserId,
      sessionId,
      cartItemIds: cartItem.id,
      isPriorityShipping: "false",
    },
  });

  // Inventory service is unreachable in test env → resolveLineItems via
  // getProduct returns null, so snapshots fall back to defaults. That's fine
  // for the idempotency/wiring assertions below; item snapshot content is
  // covered in separate tests with a mocked inventory client.
  await applyDirectSaleFromCheckout(session);

  const orders = await prisma.order.findMany({ where: { userId: clientUserId } });
  assert.equal(orders.length, 1);
  assert.equal(orders[0].source, "DIRECT_SALE");
  assert.equal(orders[0].status, "ORDERED");
  assert.equal(orders[0].stripeCheckoutSessionId, session.id);
  assert.equal(orders[0].totalInCents, 10000);
  assert.equal(orders[0].taxInCents, 825);
  assert.equal(orders[0].shippingInCents, 1000);
  assert.equal(orders[0].isPriorityShipping, false);

  const remaining = await prisma.cartItem.findMany({ where: { userId: clientUserId } });
  assert.equal(remaining.length, 0);
});

integrationTest("applyDirectSaleFromCheckout: idempotent on replay", async () => {
  const cartItem = await prisma.cartItem.create({
    data: {
      userId: clientUserId,
      inventoryProductId: "inv_test_2",
      sessionId,
      quantity: 1,
    },
  });

  const session = mockCheckoutSession({
    metadata: {
      purpose: "DIRECT_SALE",
      userId: clientUserId,
      sessionId,
      cartItemIds: cartItem.id,
      isPriorityShipping: "false",
    },
  });

  await applyDirectSaleFromCheckout(session);
  await applyDirectSaleFromCheckout(session); // replay

  const orders = await prisma.order.findMany({ where: { stripeCheckoutSessionId: session.id } });
  assert.equal(orders.length, 1);
});

integrationTest("applyDirectSaleFromCheckout: missing metadata is a no-op", async () => {
  const session = mockCheckoutSession({
    metadata: { purpose: "DIRECT_SALE" }, // missing userId/sessionId/cartItemIds
  });
  await applyDirectSaleFromCheckout(session);
  const orders = await prisma.order.findMany({
    where: { stripeCheckoutSessionId: session.id },
  });
  assert.equal(orders.length, 0);
});

integrationTest("applyDirectSaleFromCheckout: isPriorityShipping=true for Lux carts", async () => {
  const cartItem = await prisma.cartItem.create({
    data: {
      userId: clientUserId,
      inventoryProductId: "inv_test_lux",
      sessionId,
      quantity: 1,
    },
  });

  const session = mockCheckoutSession({
    metadata: {
      purpose: "DIRECT_SALE",
      userId: clientUserId,
      sessionId,
      cartItemIds: cartItem.id,
      isPriorityShipping: "true",
    },
    total_details: {
      amount_discount: 0,
      amount_shipping: 0,
      amount_tax: 825,
    },
    amount_total: 9825,
  });

  await applyDirectSaleFromCheckout(session);

  const [order] = await prisma.order.findMany({
    where: { stripeCheckoutSessionId: session.id },
  });
  assert.equal(order.isPriorityShipping, true);
  assert.equal(order.shippingInCents, 0);
});
