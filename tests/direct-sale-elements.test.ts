/**
 * Integration tests for the native /checkout (Stripe Elements) path.
 *
 * Covers:
 *   - calculateDirectSaleTax — passes line items + address into Stripe Tax,
 *     returns the breakdown the Order Summary needs.
 *   - createDirectSalePaymentIntent — pre-creates Order(PENDING) with
 *     stripePaymentIntentId and the cart snapshot, returns clientSecret.
 *   - applyDirectSalePaymentIntentSucceeded — flips PENDING → ORDERED,
 *     deletes cart items, idempotent on replay, bails on bad metadata.
 *   - Lux active session → free priority shipping.
 *
 * Stripe is stubbed via the `deps` test seam (matches the pattern in
 * direct-sale.service.ts and payout-dispatch.service.ts). DB integration is
 * keyed on wishi_p5 like the Hosted-path test.
 */

import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import {
  calculateDirectSaleTax,
  createDirectSalePaymentIntent,
  applyDirectSalePaymentIntentSucceeded,
} from "@/lib/payments/direct-sale-elements.service";

const isIntegrationEnv =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL.includes("wishi_p5");

const integrationTest = isIntegrationEnv ? test : test.skip;

let clientUserId = "";
let luxClientUserId = "";
let sessionId = "";
let luxSessionId = "";
const suiteSuffix = randomUUID().slice(0, 8);

const STD_INVENTORY_ID = "inv_elements_std_1";
const LUX_INVENTORY_ID = "inv_elements_lux_1";

const ADDRESS = {
  name: "Direct-Sale Tester",
  line1: "123 Test St",
  line2: null,
  city: "Austin",
  state: "TX",
  postalCode: "78701",
  country: "US" as const,
};

before(async () => {
  if (!isIntegrationEnv) return;

  // Standard (non-Lux) client + ACTIVE session.
  const client = await prisma.user.create({
    data: {
      email: `direct-sale-elements-${suiteSuffix}@test.local`,
      firstName: "Elements",
      lastName: "Tester",
      role: "CLIENT",
      referralCode: `EL${suiteSuffix.toUpperCase()}`,
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

  // Lux client + ACTIVE Lux session for the priority-shipping case.
  const luxClient = await prisma.user.create({
    data: {
      email: `direct-sale-elements-lux-${suiteSuffix}@test.local`,
      firstName: "Lux",
      lastName: "Tester",
      role: "CLIENT",
      referralCode: `LX${suiteSuffix.toUpperCase()}`,
    },
  });
  luxClientUserId = luxClient.id;
  const luxSession = await prisma.session.create({
    data: {
      clientId: luxClientUserId,
      planType: "LUX",
      amountPaidInCents: 55000,
      styleboardsAllowed: 8,
      status: "ACTIVE",
    },
  });
  luxSessionId = luxSession.id;

  // MerchandisedProduct rows so resolveLineItems lets the cart through.
  // The integration helpers below assume these inventoryProductIds resolve
  // via the inventory service stub baked into the test env. Skip merch
  // creation if it already exists (rerun resilience).
  for (const inventoryProductId of [STD_INVENTORY_ID, LUX_INVENTORY_ID]) {
    await prisma.merchandisedProduct.upsert({
      where: { inventoryProductId },
      update: {},
      create: { inventoryProductId, isDirectSale: true },
    });
  }
});

beforeEach(async () => {
  if (!isIntegrationEnv) return;
  for (const userId of [clientUserId, luxClientUserId]) {
    if (!userId) continue;
    await prisma.cartItem.deleteMany({ where: { userId } });
    await prisma.order.deleteMany({ where: { userId } });
  }
});

async function seedCart(opts: {
  userId: string;
  sessionId: string;
  inventoryProductId: string;
  quantity?: number;
}) {
  return prisma.cartItem.create({
    data: {
      userId: opts.userId,
      inventoryProductId: opts.inventoryProductId,
      sessionId: opts.sessionId,
      quantity: opts.quantity ?? 1,
    },
  });
}

// Stub resolveLineItems — the inventory service is unreachable in the
// test env (mirrors `direct-sale-full-flow.test.ts:154` workaround), so
// every test in this suite passes a hand-built ResolvedLineItem array.
function mockResolveLineItems(opts: {
  cartItemId: string;
  inventoryProductId: string;
  sessionId: string;
  unitAmountInCents?: number;
  quantity?: number;
}) {
  return async (_userId: string, _cartItemIds: string[]) => ({
    items: [
      {
        cartItemId: opts.cartItemId,
        inventoryProductId: opts.inventoryProductId,
        title: "Test product",
        brand: "Test brand",
        imageUrl: null,
        unitAmountInCents: opts.unitAmountInCents ?? 5000,
        quantity: opts.quantity ?? 1,
        taxCode: "txcd_99999999",
        merchant: "test-merchant",
      },
    ],
    sessionId: opts.sessionId,
  });
}

function mockTaxCalculation(overrides: Partial<Stripe.Tax.Calculation> = {}): Stripe.Tax.Calculation {
  return {
    id: `taxcalc_${randomUUID()}`,
    object: "tax.calculation",
    amount_total: 10825,
    tax_amount_exclusive: 825,
    tax_amount_inclusive: 0,
    currency: "usd",
    customer_details: {} as Stripe.Tax.Calculation["customer_details"],
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 48,
    line_items: { object: "list", data: [], has_more: false, url: "" } as unknown as Stripe.Tax.Calculation["line_items"],
    livemode: false,
    shipping_cost: null,
    tax_breakdown: [],
    tax_date: Math.floor(Date.now() / 1000),
    customer: null,
    ...overrides,
  } as unknown as Stripe.Tax.Calculation;
}

function mockPaymentIntent(overrides: Partial<Stripe.PaymentIntent> = {}): Stripe.PaymentIntent {
  return {
    id: `pi_test_${randomUUID()}`,
    object: "payment_intent",
    amount: 10825,
    currency: "usd",
    status: "succeeded",
    metadata: {},
    ...overrides,
  } as unknown as Stripe.PaymentIntent;
}

// ── calculateDirectSaleTax ─────────────────────────────────────────────────

integrationTest(
  "calculateDirectSaleTax: returns tax + total breakdown from Stripe",
  async () => {
    const cartItem = await seedCart({
      userId: clientUserId,
      sessionId,
      inventoryProductId: STD_INVENTORY_ID,
    });

    const taxCalc = mockTaxCalculation({ amount_total: 12275, tax_amount_exclusive: 1275 });
    const quote = await calculateDirectSaleTax({
      userId: clientUserId,
      cartItemIds: [cartItem.id],
      address: ADDRESS,
      deps: {
        createTaxCalculation: async () => taxCalc,
        resolveLineItems: mockResolveLineItems({
          cartItemId: cartItem.id,
          inventoryProductId: STD_INVENTORY_ID,
          sessionId,
        }),
      },
    });

    assert.equal(quote.calculationId, taxCalc.id);
    assert.equal(quote.totalInCents, 12275);
    assert.equal(quote.taxInCents, 1275);
    assert.equal(quote.shippingInCents, 1000); // standard $10
    assert.equal(quote.isPriorityShipping, false);
    assert.equal(quote.items.length, 1);
    assert.equal(quote.items[0].cartItemId, cartItem.id);
  },
);

integrationTest(
  "calculateDirectSaleTax: Lux active session → priority shipping ($0)",
  async () => {
    const cartItem = await seedCart({
      userId: luxClientUserId,
      sessionId: luxSessionId,
      inventoryProductId: LUX_INVENTORY_ID,
    });

    const quote = await calculateDirectSaleTax({
      userId: luxClientUserId,
      cartItemIds: [cartItem.id],
      address: ADDRESS,
      deps: {
        createTaxCalculation: async () => mockTaxCalculation(),
        resolveLineItems: mockResolveLineItems({
          cartItemId: cartItem.id,
          inventoryProductId: LUX_INVENTORY_ID,
          sessionId: luxSessionId,
        }),
      },
    });

    assert.equal(quote.shippingInCents, 0);
    assert.equal(quote.isPriorityShipping, true);
  },
);

// ── createDirectSalePaymentIntent ──────────────────────────────────────────

integrationTest(
  "createDirectSalePaymentIntent: pre-creates Order(PENDING) with PI binding",
  async () => {
    // getOrCreateStripeCustomer otherwise hits Stripe; pre-set it to skip
    // the call (mirrors direct-sale-full-flow.test.ts:148).
    await prisma.user.update({
      where: { id: clientUserId },
      data: { stripeCustomerId: `cus_test_${randomUUID()}` },
    });
    const cartItem = await seedCart({
      userId: clientUserId,
      sessionId,
      inventoryProductId: STD_INVENTORY_ID,
    });

    const piId = `pi_test_${randomUUID()}`;
    const result = await createDirectSalePaymentIntent({
      userId: clientUserId,
      cartItemIds: [cartItem.id],
      address: ADDRESS,
      email: "buyer@test.local",
      deps: {
        createTaxCalculation: async () => mockTaxCalculation({ amount_total: 11825, tax_amount_exclusive: 825 }),
        createPaymentIntent: async (params) => {
          assert.equal(params.metadata?.purpose, "DIRECT_SALE");
          assert.equal(params.metadata?.userId, clientUserId);
          assert.equal(typeof params.metadata?.taxCalculationId, "string");
          assert.equal(typeof params.metadata?.orderId, "string");
          return { id: piId, client_secret: `${piId}_secret_x`, amount: params.amount ?? 0 };
        },
        resolveLineItems: mockResolveLineItems({
          cartItemId: cartItem.id,
          inventoryProductId: STD_INVENTORY_ID,
          sessionId,
        }),
      },
    });

    assert.equal(result.paymentIntentId, piId);
    assert.equal(result.clientSecret, `${piId}_secret_x`);
    assert.equal(typeof result.orderId, "string");

    const order = await prisma.order.findUnique({
      where: { id: result.orderId },
      include: { items: true },
    });
    assert.ok(order);
    assert.equal(order.status, "PENDING");
    assert.equal(order.stripePaymentIntentId, piId);
    assert.equal(order.shippingLine1, ADDRESS.line1);
    assert.equal(order.shippingState, ADDRESS.state);
    assert.equal(order.items.length, 1);
    assert.equal(order.items[0].inventoryProductId, STD_INVENTORY_ID);
  },
);

// ── applyDirectSalePaymentIntentSucceeded ──────────────────────────────────

async function seedPendingOrderForPI(opts: {
  userId: string;
  sessionId: string;
  paymentIntentId: string;
  inventoryProductId: string;
  taxCalculationId?: string;
}) {
  const cartItem = await seedCart({
    userId: opts.userId,
    sessionId: opts.sessionId,
    inventoryProductId: opts.inventoryProductId,
  });
  const order = await prisma.order.create({
    data: {
      userId: opts.userId,
      sessionId: opts.sessionId,
      source: "DIRECT_SALE",
      status: "PENDING",
      retailer: "test-merchant",
      totalInCents: 10825,
      taxInCents: 825,
      shippingInCents: 1000,
      currency: "usd",
      stripePaymentIntentId: opts.paymentIntentId,
      items: {
        create: [
          {
            inventoryProductId: opts.inventoryProductId,
            title: "Test product",
            priceInCents: 5000,
            quantity: 1,
          },
        ],
      },
    },
  });
  return { cartItem, order };
}

integrationTest(
  "applyDirectSalePaymentIntentSucceeded: flips PENDING → ORDERED + clears cart",
  async () => {
    const piId = `pi_test_${randomUUID()}`;
    const { order } = await seedPendingOrderForPI({
      userId: clientUserId,
      sessionId,
      paymentIntentId: piId,
      inventoryProductId: STD_INVENTORY_ID,
    });

    const pi = mockPaymentIntent({
      id: piId,
      amount: 10825,
      metadata: {
        purpose: "DIRECT_SALE",
        userId: clientUserId,
        sessionId,
        orderId: order.id,
      },
    });
    await applyDirectSalePaymentIntentSucceeded(pi);

    const refreshed = await prisma.order.findUnique({ where: { id: order.id } });
    assert.equal(refreshed?.status, "ORDERED");
    assert.equal(refreshed?.totalInCents, 10825);
    assert.equal(refreshed?.stripePaymentIntentId, piId);

    const remaining = await prisma.cartItem.findMany({ where: { userId: clientUserId } });
    assert.equal(remaining.length, 0);
  },
);

integrationTest(
  "applyDirectSalePaymentIntentSucceeded: idempotent on replay",
  async () => {
    const piId = `pi_test_${randomUUID()}`;
    const { order } = await seedPendingOrderForPI({
      userId: clientUserId,
      sessionId,
      paymentIntentId: piId,
      inventoryProductId: STD_INVENTORY_ID,
    });

    const pi = mockPaymentIntent({
      id: piId,
      metadata: {
        purpose: "DIRECT_SALE",
        userId: clientUserId,
        sessionId,
        orderId: order.id,
      },
    });
    await applyDirectSalePaymentIntentSucceeded(pi);
    await applyDirectSalePaymentIntentSucceeded(pi); // replay

    const orders = await prisma.order.findMany({
      where: { stripePaymentIntentId: piId },
    });
    assert.equal(orders.length, 1);
    assert.equal(orders[0].status, "ORDERED");
  },
);

integrationTest(
  "applyDirectSalePaymentIntentSucceeded: missing metadata is a no-op",
  async () => {
    const pi = mockPaymentIntent({
      metadata: { purpose: "DIRECT_SALE" }, // no orderId/userId/sessionId
    });
    await applyDirectSalePaymentIntentSucceeded(pi);
    // No assertion target — we're verifying the handler returns without
    // throwing. Confirm with a downstream cart sanity check.
    const remaining = await prisma.cartItem.findMany({ where: { userId: clientUserId } });
    assert.equal(remaining.length, 0); // no carts yet in this test
  },
);

integrationTest(
  "applyDirectSalePaymentIntentSucceeded: non-DIRECT_SALE purpose ignored",
  async () => {
    const pi = mockPaymentIntent({ metadata: { purpose: "tip" } });
    await applyDirectSalePaymentIntentSucceeded(pi);
    // No throw, no DB change.
  },
);

integrationTest(
  "applyDirectSalePaymentIntentSucceeded: bails when order not found",
  async () => {
    const pi = mockPaymentIntent({
      metadata: {
        purpose: "DIRECT_SALE",
        userId: clientUserId,
        sessionId,
        orderId: "nonexistent_order_id",
      },
    });
    await applyDirectSalePaymentIntentSucceeded(pi);
    // Returns silently — verified by lack of throw.
  },
);
