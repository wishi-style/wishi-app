/**
 * Integration tests covering the test-plan items the direct-sale webhook
 * suite doesn't hit directly:
 *
 *   - Direct-sale-only cart guard (PR test-plan item 7).
 *   - ARRIVED transition auto-creates ClosetItems (item 2).
 *   - Self-serve return initiation eligibility + state transition (item 3).
 *
 * Runs against the shared wishi_p5 database. Per-suite uuid suffix for user
 * emails keeps reruns and sibling suites from colliding.
 */

import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { addCartItem } from "@/lib/cart/cart.service";
import { transitionOrderStatus } from "@/lib/orders/admin-orders.service";
import { initiateReturn, RETURN_WINDOW_MS } from "@/lib/orders/client-orders.service";

const isIntegrationEnv =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL.includes("wishi_p5");

const integrationTest = isIntegrationEnv ? test : test.skip;

const suiteSuffix = randomUUID().slice(0, 8);
let clientUserId = "";
let sessionId = "";

before(async () => {
  if (!isIntegrationEnv) return;
  const client = await prisma.user.create({
    data: {
      email: `orders-flow-${suiteSuffix}@test.local`,
      firstName: "OF",
      lastName: "Tester",
      role: "CLIENT",
      referralCode: `OF${suiteSuffix.toUpperCase()}`,
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
  await prisma.cartItem.deleteMany({ where: { userId: clientUserId } });
  await prisma.closetItem.deleteMany({ where: { userId: clientUserId } });
  await prisma.order.deleteMany({ where: { userId: clientUserId } });
  await prisma.merchandisedProduct.deleteMany({
    where: { inventoryProductId: { startsWith: `of_${suiteSuffix}_` } },
  });
});

integrationTest(
  "addCartItem: rejects products not flagged as direct-sale",
  async () => {
    const inventoryProductId = `of_${suiteSuffix}_not_merch`;
    // No MerchandisedProduct row → isDirectSale returns false → guard rejects
    await assert.rejects(
      () =>
        addCartItem({
          userId: clientUserId,
          inventoryProductId,
          sessionId,
          quantity: 1,
        }),
      /not marked direct-sale/,
    );

    const cart = await prisma.cartItem.findMany({ where: { userId: clientUserId } });
    assert.equal(cart.length, 0);
  },
);

integrationTest(
  "addCartItem: accepts and upserts quantity for direct-sale products",
  async () => {
    const inventoryProductId = `of_${suiteSuffix}_direct`;
    await prisma.merchandisedProduct.create({
      data: { inventoryProductId, isDirectSale: true },
    });

    await addCartItem({ userId: clientUserId, inventoryProductId, sessionId });
    await addCartItem({
      userId: clientUserId,
      inventoryProductId,
      sessionId,
      quantity: 2,
    });

    const cart = await prisma.cartItem.findMany({ where: { userId: clientUserId } });
    assert.equal(cart.length, 1);
    assert.equal(cart[0].quantity, 3);
  },
);

integrationTest(
  "transitionOrderStatus: ARRIVED materializes ClosetItems from OrderItems",
  async () => {
    const order = await prisma.order.create({
      data: {
        userId: clientUserId,
        sessionId,
        source: "DIRECT_SALE",
        status: "SHIPPED",
        retailer: "test-merchant",
        totalInCents: 5000,
        currency: "usd",
        stripeCheckoutSessionId: `cs_test_${randomUUID()}`,
        stripePaymentIntentId: `pi_test_${randomUUID()}`,
        items: {
          create: [
            {
              inventoryProductId: `of_${suiteSuffix}_arr_1`,
              title: "Test Shirt",
              brand: "Test Brand",
              imageUrl: "https://example.com/shirt.jpg",
              priceInCents: 5000,
              quantity: 1,
              size: "M",
              color: "blue",
            },
          ],
        },
      },
      include: { items: true },
    });

    await transitionOrderStatus(order.id, "ARRIVED");

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(updated.status, "ARRIVED");
    assert.ok(updated.arrivedAt, "arrivedAt should be set");

    const closet = await prisma.closetItem.findMany({
      where: { userId: clientUserId, sourceOrderItemId: order.items[0].id },
    });
    assert.equal(closet.length, 1);
    assert.equal(closet[0].name, "Test Shirt");
    assert.equal(closet[0].designer, "Test Brand");
    assert.equal(closet[0].size, "M");
    assert.deepEqual(closet[0].colors, ["blue"]);
  },
);

integrationTest(
  "transitionOrderStatus: ARRIVED is idempotent on auto-create (replay doesn't duplicate closet items)",
  async () => {
    const order = await prisma.order.create({
      data: {
        userId: clientUserId,
        sessionId,
        source: "DIRECT_SALE",
        status: "SHIPPED",
        retailer: "test-merchant",
        totalInCents: 5000,
        currency: "usd",
        stripeCheckoutSessionId: `cs_test_${randomUUID()}`,
        stripePaymentIntentId: `pi_test_${randomUUID()}`,
        items: {
          create: [
            {
              inventoryProductId: `of_${suiteSuffix}_arr_2`,
              title: "Test Pant",
              priceInCents: 5000,
              quantity: 1,
            },
          ],
        },
      },
    });

    await transitionOrderStatus(order.id, "ARRIVED");
    // Second call — transition should refuse (not in allowed transitions from ARRIVED),
    // but the closet auto-create inside the first call is what we care about
    // being idempotent. Re-run the underlying hook directly.
    const { createClosetItemsFromOrder } = await import("@/lib/closet/auto-create");
    await createClosetItemsFromOrder(order.id);

    const closet = await prisma.closetItem.findMany({ where: { userId: clientUserId } });
    assert.equal(closet.length, 1);
  },
);

integrationTest(
  "initiateReturn: ARRIVED within window transitions to RETURN_IN_PROCESS",
  async () => {
    const order = await prisma.order.create({
      data: {
        userId: clientUserId,
        sessionId,
        source: "DIRECT_SALE",
        status: "ARRIVED",
        arrivedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        retailer: "test-merchant",
        totalInCents: 5000,
        currency: "usd",
        stripeCheckoutSessionId: `cs_test_${randomUUID()}`,
      },
    });

    const returned = await initiateReturn(clientUserId, order.id);
    assert.equal(returned.status, "RETURN_IN_PROCESS");
    assert.ok(returned.returnInitiatedAt);
  },
);

integrationTest(
  "initiateReturn: rejects when arrival is past the return window",
  async () => {
    const order = await prisma.order.create({
      data: {
        userId: clientUserId,
        sessionId,
        source: "DIRECT_SALE",
        status: "ARRIVED",
        arrivedAt: new Date(Date.now() - RETURN_WINDOW_MS - 60_000), // 14d + 1min ago
        retailer: "test-merchant",
        totalInCents: 5000,
        currency: "usd",
        stripeCheckoutSessionId: `cs_test_${randomUUID()}`,
      },
    });

    await assert.rejects(
      () => initiateReturn(clientUserId, order.id),
      /window/i,
    );

    const still = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(still.status, "ARRIVED");
  },
);

integrationTest(
  "initiateReturn: rejects AFFILIATE_CONFIRMED orders (wrong source)",
  async () => {
    const order = await prisma.order.create({
      data: {
        userId: clientUserId,
        sessionId,
        source: "AFFILIATE_CONFIRMED",
        status: "ARRIVED",
        arrivedAt: new Date(),
        retailer: "partner-retailer",
        totalInCents: 5000,
        currency: "usd",
      },
    });

    await assert.rejects(
      () => initiateReturn(clientUserId, order.id),
      /direct-sale/,
    );
  },
);

integrationTest(
  "initiateReturn: 404s when the order belongs to a different user",
  async () => {
    const other = await prisma.user.create({
      data: {
        email: `orders-flow-other-${suiteSuffix}@test.local`,
        firstName: "Other",
        lastName: "User",
        role: "CLIENT",
        referralCode: `OO${suiteSuffix.toUpperCase()}`,
      },
    });
    const otherSession = await prisma.session.create({
      data: {
        clientId: other.id,
        planType: "MAJOR",
        amountPaidInCents: 13000,
        styleboardsAllowed: 3,
        status: "ACTIVE",
      },
    });
    const order = await prisma.order.create({
      data: {
        userId: other.id,
        sessionId: otherSession.id,
        source: "DIRECT_SALE",
        status: "ARRIVED",
        arrivedAt: new Date(),
        retailer: "test-merchant",
        totalInCents: 5000,
        currency: "usd",
        stripeCheckoutSessionId: `cs_test_${randomUUID()}`,
      },
    });

    await assert.rejects(
      () => initiateReturn(clientUserId, order.id),
      /not found/,
    );

    // Cleanup
    await prisma.order.deleteMany({ where: { userId: other.id } });
    await prisma.session.deleteMany({ where: { clientId: other.id } });
    await prisma.user.delete({ where: { id: other.id } });
  },
);
