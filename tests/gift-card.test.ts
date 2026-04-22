// Integration tests for gift-card webhook fulfillment + promo-code redemption.
// Direct call to applyGiftCardPurchaseFromCheckout with a fake Stripe Session
// — idempotency + dual-code issuance + amount-mismatch are all testable
// without touching Stripe.

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import {
  applyGiftCardPurchaseFromCheckout,
  redeemPromoCode,
} from "@/lib/promotions/gift-card.service";
import {
  cleanupE2EUserByEmail,
  ensureClientUser,
} from "./e2e/db";

type User = { id: string; email: string };
const teardown: User[] = [];

afterEach(async () => {
  while (teardown.length > 0) {
    const u = teardown.pop();
    if (u) await cleanupE2EUserByEmail(u.email);
  }
});

function fakeGiftCardCheckout(opts: {
  purchaserUserId: string;
  paymentIntentId: string;
  amountInCents: number;
  recipientEmail: string;
  amountTotal?: number;
}): Stripe.Checkout.Session {
  return {
    id: `cs_test_gc_${opts.paymentIntentId}`,
    payment_intent: opts.paymentIntentId,
    amount_total: opts.amountTotal ?? opts.amountInCents,
    currency: "usd",
    metadata: {
      purpose: "GIFT_CARD_PURCHASE",
      purchaserUserId: opts.purchaserUserId,
      amountInCents: String(opts.amountInCents),
      recipientEmail: opts.recipientEmail,
      recipientName: "",
      message: "",
    },
  } as unknown as Stripe.Checkout.Session;
}

test("applyGiftCardPurchaseFromCheckout issues two PromoCodes + one GiftCard + one Payment", async () => {
  const suffix = randomUUID().slice(0, 8);
  const buyer = await ensureClientUser({
    clerkId: `gc_${suffix}`,
    email: `gc-${suffix}@example.com`,
    firstName: "Gift",
    lastName: "Buyer",
  });
  teardown.push(buyer as User);

  await applyGiftCardPurchaseFromCheckout(
    fakeGiftCardCheckout({
      purchaserUserId: buyer.id,
      paymentIntentId: `pi_test_gc_${suffix}`,
      amountInCents: 5000,
      recipientEmail: `gift-recipient-${suffix}@example.com`,
    }),
  );

  const giftCards = await prisma.giftCard.findMany({
    where: { purchaserUserId: buyer.id },
    include: { sessionPromoCode: true, shoppingPromoCode: true },
  });
  assert.equal(giftCards.length, 1);
  assert.equal(giftCards[0].amountInCents, 5000);
  assert.equal(giftCards[0].sessionPromoCode.creditType, "SESSION");
  assert.equal(giftCards[0].shoppingPromoCode.creditType, "SHOPPING");
  assert.equal(giftCards[0].sessionPromoCode.amountInCents, 5000);
  assert.equal(giftCards[0].shoppingPromoCode.amountInCents, 5000);

  const payments = await prisma.payment.findMany({
    where: { userId: buyer.id, type: "GIFT_CARD_PURCHASE" },
  });
  assert.equal(payments.length, 1);
  assert.equal(payments[0].giftCardId, giftCards[0].id);
});

test("applyGiftCardPurchaseFromCheckout is idempotent on duplicate PaymentIntent", async () => {
  const suffix = randomUUID().slice(0, 8);
  const buyer = await ensureClientUser({
    clerkId: `gci_${suffix}`,
    email: `gci-${suffix}@example.com`,
    firstName: "Gift",
    lastName: "Buyer",
  });
  teardown.push(buyer as User);

  const event = fakeGiftCardCheckout({
    purchaserUserId: buyer.id,
    paymentIntentId: `pi_test_gci_${suffix}`,
    amountInCents: 5000,
    recipientEmail: `gift-recipient-${suffix}@example.com`,
  });

  await applyGiftCardPurchaseFromCheckout(event);
  await applyGiftCardPurchaseFromCheckout(event); // replay

  const giftCards = await prisma.giftCard.count({
    where: { purchaserUserId: buyer.id },
  });
  assert.equal(giftCards, 1);
  const payments = await prisma.payment.count({
    where: { userId: buyer.id, type: "GIFT_CARD_PURCHASE" },
  });
  assert.equal(payments, 1);
});

test("applyGiftCardPurchaseFromCheckout rejects amount mismatch", async () => {
  const suffix = randomUUID().slice(0, 8);
  const buyer = await ensureClientUser({
    clerkId: `gcm_${suffix}`,
    email: `gcm-${suffix}@example.com`,
    firstName: "Gift",
    lastName: "Buyer",
  });
  teardown.push(buyer as User);

  await applyGiftCardPurchaseFromCheckout(
    fakeGiftCardCheckout({
      purchaserUserId: buyer.id,
      paymentIntentId: `pi_test_gcm_${suffix}`,
      amountInCents: 5000,
      amountTotal: 1, // mismatch
      recipientEmail: `gift-recipient-${suffix}@example.com`,
    }),
  );

  const giftCards = await prisma.giftCard.count({
    where: { purchaserUserId: buyer.id },
  });
  assert.equal(giftCards, 0);
});

test("redeemPromoCode increments usedCount and marks GiftCard redeemed", async () => {
  const suffix = randomUUID().slice(0, 8);
  const buyer = await ensureClientUser({
    clerkId: `gcr_${suffix}`,
    email: `gcr-${suffix}@example.com`,
    firstName: "Gift",
    lastName: "Redeemer",
  });
  teardown.push(buyer as User);

  await applyGiftCardPurchaseFromCheckout(
    fakeGiftCardCheckout({
      purchaserUserId: buyer.id,
      paymentIntentId: `pi_test_gcr_${suffix}`,
      amountInCents: 5000,
      recipientEmail: `gift-recipient-${suffix}@example.com`,
    }),
  );

  const giftCard = await prisma.giftCard.findFirstOrThrow({
    where: { purchaserUserId: buyer.id },
    include: { sessionPromoCode: true },
  });

  const result = await prisma.$transaction((tx) =>
    redeemPromoCode(giftCard.sessionPromoCode.code, "SESSION", tx),
  );
  assert.ok(result);
  assert.equal(result?.amountInCents, 5000);

  const second = await prisma.$transaction((tx) =>
    redeemPromoCode(giftCard.sessionPromoCode.code, "SESSION", tx),
  );
  assert.equal(second, null, "redemption must be single-use");

  const refreshed = await prisma.giftCard.findUniqueOrThrow({
    where: { id: giftCard.id },
  });
  assert.ok(refreshed.redeemedAt, "GiftCard should be marked redeemed");
});

test("redeemPromoCode rejects mismatched creditType", async () => {
  const suffix = randomUUID().slice(0, 8);
  const buyer = await ensureClientUser({
    clerkId: `gcx_${suffix}`,
    email: `gcx-${suffix}@example.com`,
    firstName: "Gift",
    lastName: "Xmatch",
  });
  teardown.push(buyer as User);

  await applyGiftCardPurchaseFromCheckout(
    fakeGiftCardCheckout({
      purchaserUserId: buyer.id,
      paymentIntentId: `pi_test_gcx_${suffix}`,
      amountInCents: 5000,
      recipientEmail: `gift-recipient-${suffix}@example.com`,
    }),
  );

  const giftCard = await prisma.giftCard.findFirstOrThrow({
    where: { purchaserUserId: buyer.id },
    include: { sessionPromoCode: true },
  });

  // Session code redeemed as SHOPPING type — must fail.
  const bad = await prisma.$transaction((tx) =>
    redeemPromoCode(giftCard.sessionPromoCode.code, "SHOPPING", tx),
  );
  assert.equal(bad, null);
});
