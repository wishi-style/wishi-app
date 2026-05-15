// Unit tests for handleCheckoutCompleted's metadata.purpose routing.
// Asserts the right downstream service is invoked for each purpose and
// that the default booking path still runs when purpose is absent.
//
// The service-layer tests (session-upgrade, buy-more-looks, gift-card)
// cover each fulfillment's business logic; this fills the gap between
// those and the full webhook chain by exercising the router.

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { handleCheckoutCompleted } from "@/lib/payments/webhook-handlers";
import { cleanupE2EUserByEmail, ensureClientUser } from "./e2e/db";

type User = { id: string; email: string };
const teardown: User[] = [];

afterEach(async () => {
  while (teardown.length > 0) {
    const u = teardown.pop();
    if (u) await cleanupE2EUserByEmail(u.email);
  }
});

function fakeGiftCardEvent(opts: {
  purchaserUserId: string;
  paymentIntentId: string;
  amountInCents: number;
  recipientEmail: string;
}): Stripe.Checkout.Session {
  return {
    id: `cs_test_rt_${opts.paymentIntentId}`,
    payment_intent: opts.paymentIntentId,
    amount_total: opts.amountInCents,
    currency: "usd",
    metadata: {
      purpose: "GIFT_CARD_PURCHASE",
      purchaserUserId: opts.purchaserUserId,
      amountInCents: String(opts.amountInCents),
      recipientEmail: opts.recipientEmail,
    },
  } as unknown as Stripe.Checkout.Session;
}

test("handleCheckoutCompleted routes GIFT_CARD_PURCHASE to gift-card fulfillment", async () => {
  const suffix = randomUUID().slice(0, 8);
  const buyer = await ensureClientUser({
    clerkId: `rt_gc_${suffix}`,
    email: `rt-gc-${suffix}@example.com`,
    firstName: "Route",
    lastName: "Test",
  });
  teardown.push(buyer as User);

  await handleCheckoutCompleted(
    fakeGiftCardEvent({
      purchaserUserId: buyer.id,
      paymentIntentId: `pi_rt_${suffix}`,
      amountInCents: 5000,
      recipientEmail: `recipient-${suffix}@example.com`,
    }),
  );

  // Proof the router picked the right branch: artifacts only the
  // gift-card fulfillment produces.
  const giftCards = await prisma.giftCard.count({
    where: { purchaserUserId: buyer.id },
  });
  assert.equal(giftCards, 1);
  const promoCount = await prisma.promoCode.count({
    where: {
      OR: [
        { giftCardSessionCodes: { some: { purchaserUserId: buyer.id } } },
        { giftCardShoppingCodes: { some: { purchaserUserId: buyer.id } } },
      ],
    },
  });
  assert.equal(promoCount, 2);
});

test("handleCheckoutCompleted skips the default-booking path when metadata.purpose is set", async () => {
  const suffix = randomUUID().slice(0, 8);
  const buyer = await ensureClientUser({
    clerkId: `rt_nb_${suffix}`,
    email: `rt-nb-${suffix}@example.com`,
    firstName: "Route",
    lastName: "NoBooking",
  });
  teardown.push(buyer as User);

  await handleCheckoutCompleted(
    fakeGiftCardEvent({
      purchaserUserId: buyer.id,
      paymentIntentId: `pi_rt_nb_${suffix}`,
      amountInCents: 5000,
      recipientEmail: `recipient-nb-${suffix}@example.com`,
    }),
  );

  // No Session should be created — the default-booking branch was never
  // reached because the GIFT_CARD_PURCHASE branch short-circuited.
  const sessions = await prisma.session.count({ where: { clientId: buyer.id } });
  assert.equal(sessions, 0);
});

function fakeCheckoutSessionWithName(opts: {
  userId: string;
  name: string | null;
}): Stripe.Checkout.Session {
  return {
    id: `cs_test_name_${opts.userId}`,
    metadata: { userId: opts.userId, planType: "MINI" },
    customer_details: { name: opts.name },
    amount_total: 6000,
  } as unknown as Stripe.Checkout.Session;
}

test("handleCheckoutCompleted captures customer_details.name into empty User row", async () => {
  const suffix = randomUUID().slice(0, 8);
  const user = await ensureClientUser({
    clerkId: `rt_name_${suffix}`,
    email: `rt-name-${suffix}@example.com`,
    firstName: "",
    lastName: "",
  });
  teardown.push(user as User);

  await handleCheckoutCompleted(
    fakeCheckoutSessionWithName({ userId: user.id, name: "Matt Cardozo" }),
  );

  const after = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { firstName: true, lastName: true },
  });
  assert.equal(after.firstName, "Matt");
  assert.equal(after.lastName, "Cardozo");
});

test("handleCheckoutCompleted redeems promo code in metadata + links Session/Payment", async () => {
  const suffix = randomUUID().slice(0, 8);
  const buyer = await ensureClientUser({
    clerkId: `rt_promo_${suffix}`,
    email: `rt-promo-${suffix}@example.com`,
    firstName: "Promo",
    lastName: "Booker",
  });
  teardown.push(buyer as User);

  // Seed a promo locally — bypass createPromoCode so we don't depend on a
  // live Stripe Coupon (the webhook only needs the DB row to redeem against).
  const promo = await prisma.promoCode.create({
    data: {
      code: `PCT-${suffix.toUpperCase()}`,
      creditType: "SESSION",
      discountType: "PERCENT",
      discountValue: 50,
      isActive: true,
      usageLimit: 1,
    },
  });

  const paymentIntentId = `pi_rt_promo_${suffix}`;
  await handleCheckoutCompleted({
    id: `cs_test_promo_${suffix}`,
    payment_intent: paymentIntentId,
    amount_total: 3000, // 50% of $60 Mini
    currency: "usd",
    customer_details: { name: null },
    metadata: {
      userId: buyer.id,
      planType: "MINI",
      promoCodeId: promo.id,
    },
  } as unknown as Stripe.Checkout.Session);

  const session = await prisma.session.findFirstOrThrow({
    where: { clientId: buyer.id },
    select: { id: true, promoCodeId: true, amountPaidInCents: true },
  });
  assert.equal(session.promoCodeId, promo.id);
  assert.equal(session.amountPaidInCents, 3000);

  const payment = await prisma.payment.findUniqueOrThrow({
    where: { stripePaymentIntentId: paymentIntentId },
    select: { promoCodeId: true, amountInCents: true },
  });
  assert.equal(payment.promoCodeId, promo.id);
  assert.equal(payment.amountInCents, 3000);

  const refreshed = await prisma.promoCode.findUniqueOrThrow({
    where: { id: promo.id },
    select: { usedCount: true },
  });
  assert.equal(refreshed.usedCount, 1);

  // Cleanup: cleanupE2EUserByEmail deletes Session+Payment+User; the promo
  // row stays orphaned but doesn't interfere with other tests.
  await prisma.payment.deleteMany({ where: { id: { in: [] } } }); // no-op safety
  await prisma.session.deleteMany({ where: { id: session.id } });
  await prisma.promoCode.delete({ where: { id: promo.id } });
});

test("handleCheckoutCompleted reconciles a Stripe-typed coupon back to PromoCode when metadata empty", async () => {
  const suffix = randomUUID().slice(0, 8);
  const buyer = await ensureClientUser({
    clerkId: `rt_recon_${suffix}`,
    email: `rt-recon-${suffix}@example.com`,
    firstName: "Recon",
    lastName: "Booker",
  });
  teardown.push(buyer as User);

  const stripeCouponId = `STRP-${suffix.toUpperCase()}`;
  const promo = await prisma.promoCode.create({
    data: {
      code: stripeCouponId,
      creditType: "SESSION",
      discountType: "AMOUNT",
      discountValue: 1000,
      stripeCouponId,
      isActive: true,
      usageLimit: 1,
    },
  });

  const paymentIntentId = `pi_rt_recon_${suffix}`;
  await handleCheckoutCompleted({
    id: `cs_test_recon_${suffix}`,
    payment_intent: paymentIntentId,
    amount_total: 5000,
    currency: "usd",
    customer_details: { name: null },
    metadata: {
      userId: buyer.id,
      planType: "MINI",
      // promoCodeId intentionally absent — simulates the allow_promotion_codes
      // path where a code is typed on Stripe's hosted page.
    },
    total_details: { amount_discount: 1000 },
    discounts: [{ coupon: stripeCouponId }],
  } as unknown as Stripe.Checkout.Session);

  const session = await prisma.session.findFirstOrThrow({
    where: { clientId: buyer.id },
    select: { id: true, promoCodeId: true },
  });
  assert.equal(session.promoCodeId, promo.id);

  const refreshed = await prisma.promoCode.findUniqueOrThrow({
    where: { id: promo.id },
    select: { usedCount: true },
  });
  assert.equal(refreshed.usedCount, 1, "Stripe-typed redemption must increment usedCount");

  await prisma.session.deleteMany({ where: { id: session.id } });
  await prisma.promoCode.delete({ where: { id: promo.id } });
});

test("handleCheckoutCompleted does not overwrite an existing name", async () => {
  const suffix = randomUUID().slice(0, 8);
  const user = await ensureClientUser({
    clerkId: `rt_name2_${suffix}`,
    email: `rt-name2-${suffix}@example.com`,
    firstName: "Already",
    lastName: "Named",
  });
  teardown.push(user as User);

  await handleCheckoutCompleted(
    fakeCheckoutSessionWithName({ userId: user.id, name: "Different Person" }),
  );

  const after = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { firstName: true, lastName: true },
  });
  assert.equal(after.firstName, "Already");
  assert.equal(after.lastName, "Named");
});
