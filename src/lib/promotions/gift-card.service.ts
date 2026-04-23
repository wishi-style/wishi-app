import type Stripe from "stripe";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getOrCreateStripeCustomer } from "@/lib/payments/stripe-customer";
import { sendTransactionalEmail } from "@/lib/notifications/transactional";
import { Prisma } from "@/generated/prisma/client";

export const GIFT_CARD_MIN_CENTS = 2500; // $25 floor
export const GIFT_CARD_MAX_CENTS = 50000; // $500 ceiling

type TxClient = Prisma.TransactionClient;

export interface CreateGiftCardCheckoutInput {
  purchaserUserId: string;
  amountInCents: number;
  recipientEmail: string;
  recipientName?: string;
  message?: string;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Spin up a Stripe Checkout session for a gift-card purchase. The entitled
 * artifacts (the GiftCard row + its two PromoCodes) are only created on
 * webhook fulfillment — this keeps things idempotent and correct if the
 * purchaser abandons checkout.
 */
export async function createGiftCardCheckout(input: CreateGiftCardCheckoutInput) {
  if (
    !Number.isInteger(input.amountInCents) ||
    input.amountInCents < GIFT_CARD_MIN_CENTS ||
    input.amountInCents > GIFT_CARD_MAX_CENTS
  ) {
    throw new Error(
      `Gift card amount must be between $${GIFT_CARD_MIN_CENTS / 100} and $${GIFT_CARD_MAX_CENTS / 100}`,
    );
  }
  if (!input.recipientEmail.includes("@")) {
    throw new Error("Recipient email is required");
  }

  const customerId = await getOrCreateStripeCustomer(input.purchaserUserId);

  return stripe.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: input.amountInCents,
          product_data: {
            name: "Wishi Gift Card",
            description: `Gift card for ${input.recipientEmail}`,
          },
        },
        quantity: 1,
      },
    ],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: {
      purpose: "GIFT_CARD_PURCHASE",
      purchaserUserId: input.purchaserUserId,
      amountInCents: String(input.amountInCents),
      recipientEmail: input.recipientEmail,
      recipientName: input.recipientName ?? "",
      message: input.message ?? "",
    },
  });
}

/**
 * Webhook fulfillment. Called from handleCheckoutCompleted when
 * metadata.purpose === "GIFT_CARD_PURCHASE". Idempotent via PaymentIntent
 * uniqueness — a replay short-circuits cleanly.
 *
 * Creates 3 rows atomically: one GiftCard, two PromoCodes (SESSION + SHOPPING).
 * The dual-PromoCode model matches the business rule "gift cards unlock both
 * a styling session and a shopping credit of the same amount."
 */
export async function applyGiftCardPurchaseFromCheckout(
  checkoutSession: Stripe.Checkout.Session,
) {
  const meta = checkoutSession.metadata ?? {};
  const purchaserUserId = meta.purchaserUserId;
  const recipientEmail = meta.recipientEmail;
  const recipientName = meta.recipientName || null;
  const message = meta.message || null;
  const expectedTotal = Number(meta.amountInCents);

  if (!purchaserUserId || !recipientEmail) {
    console.error(
      "[stripe] applyGiftCardPurchaseFromCheckout: missing metadata",
      checkoutSession.id,
    );
    return;
  }

  const paymentIntentId =
    typeof checkoutSession.payment_intent === "string"
      ? checkoutSession.payment_intent
      : checkoutSession.payment_intent?.id ?? null;
  if (!paymentIntentId) {
    console.error(
      "[stripe] applyGiftCardPurchaseFromCheckout: no payment_intent",
      checkoutSession.id,
    );
    return;
  }

  // Fast-path idempotency: a matching Payment already exists. The
  // authoritative guard is the unique constraint catch below — this read
  // just avoids the write-path work when the happy case is a replay.
  const existingPayment = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: paymentIntentId },
    select: { id: true },
  });
  if (existingPayment) return;

  const amountPaid = checkoutSession.amount_total ?? 0;
  if (!Number.isFinite(expectedTotal) || expectedTotal !== amountPaid) {
    console.error(
      "[stripe] applyGiftCardPurchaseFromCheckout: amount mismatch",
      { checkoutSessionId: checkoutSession.id, expectedTotal, amountPaid },
    );
    return;
  }

  const currency = checkoutSession.currency ?? "usd";

  let createdCodes: { sessionCode: string; shoppingCode: string } | null = null;

  try {
    createdCodes = await prisma.$transaction(async (tx) => {
      const sessionCode = await tx.promoCode.create({
        data: {
          code: giftPromoCode("S"),
          creditType: "SESSION",
          amountInCents: amountPaid,
          usageLimit: 1,
        },
      });
      const shoppingCode = await tx.promoCode.create({
        data: {
          code: giftPromoCode("H"),
          creditType: "SHOPPING",
          amountInCents: amountPaid,
          usageLimit: 1,
        },
      });

      const giftCard = await tx.giftCard.create({
        data: {
          code: giftCardCode(),
          purchaserUserId,
          recipientEmail,
          recipientName,
          message,
          amountInCents: amountPaid,
          currency,
          sessionPromoCodeId: sessionCode.id,
          shoppingPromoCodeId: shoppingCode.id,
        },
      });

      await tx.payment.create({
        data: {
          userId: purchaserUserId,
          type: "GIFT_CARD_PURCHASE",
          status: "SUCCEEDED",
          amountInCents: amountPaid,
          currency,
          stripePaymentIntentId: paymentIntentId,
          giftCardId: giftCard.id,
          description: `Gift card for ${recipientEmail}`,
        },
      });

      return { sessionCode: sessionCode.code, shoppingCode: shoppingCode.code };
    });
  } catch (err) {
    // P2002 on Payment.stripePaymentIntentId means a concurrent webhook
    // for this same PaymentIntent landed first — the transaction rolled
    // back cleanly and there's nothing for us to do. Any other error
    // (schema/connection/etc) bubbles so the webhook can retry.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return;
    }
    throw err;
  }

  if (!createdCodes) return;

  const purchaser = await prisma.user.findUnique({
    where: { id: purchaserUserId },
    select: { firstName: true, lastName: true },
  });
  const purchaserName = purchaser
    ? `${purchaser.firstName ?? ""} ${purchaser.lastName ?? ""}`.trim()
    : "";

  await sendTransactionalEmail({
    event: "gift-card.delivered",
    profile: {
      email: recipientEmail,
      firstName: recipientName ?? undefined,
    },
    properties: {
      amountInCents: amountPaid,
      currency,
      sessionCode: createdCodes.sessionCode,
      shoppingCode: createdCodes.shoppingCode,
      purchaserName: purchaserName || "A friend",
      message: message ?? "",
    },
  }).catch((err) => {
    console.warn(`[gift-card] recipient email failed for ${recipientEmail}:`, err);
  });
}

/**
 * Consume a PromoCode at checkout time. Returns the discount in cents,
 * or null if the code is invalid/expired/exhausted. Runs the usage-count
 * increment atomically so two concurrent redemptions can't oversubscribe
 * a `usageLimit=1` code.
 */
export async function redeemPromoCode(
  code: string,
  creditType: "SESSION" | "SHOPPING",
  tx: TxClient,
): Promise<{ promoCodeId: string; amountInCents: number } | null> {
  const promo = await tx.promoCode.findUnique({ where: { code } });
  if (!promo || !promo.isActive) return null;
  if (promo.creditType !== creditType) return null;
  if (promo.expiresAt && promo.expiresAt < new Date()) return null;
  if (promo.usageLimit !== null && promo.usedCount >= promo.usageLimit) return null;

  // Atomic guard on usage — the where clause prevents a race between
  // two simultaneous redemptions of a usageLimit=1 code.
  const updated = await tx.promoCode.updateMany({
    where: {
      id: promo.id,
      ...(promo.usageLimit !== null ? { usedCount: { lt: promo.usageLimit } } : {}),
    },
    data: { usedCount: { increment: 1 } },
  });
  if (updated.count === 0) return null;

  // Mark the linked GiftCard as redeemed when either of its two codes is
  // used. First redemption stamps redeemedAt; second call is a no-op.
  await tx.giftCard.updateMany({
    where: {
      OR: [{ sessionPromoCodeId: promo.id }, { shoppingPromoCodeId: promo.id }],
      redeemedAt: null,
    },
    data: { redeemedAt: new Date() },
  });

  return { promoCodeId: promo.id, amountInCents: promo.amountInCents };
}

function giftPromoCode(prefix: "S" | "H"): string {
  return `GIFT-${prefix}-${nanoid(10).toUpperCase()}`;
}

function giftCardCode(): string {
  return `GC-${nanoid(12).toUpperCase()}`;
}
