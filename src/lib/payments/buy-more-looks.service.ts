import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getOrCreateStripeCustomer } from "./stripe-customer";
import { getPlanByType } from "@/lib/plans";
import { openAction } from "@/lib/pending-actions";

export const MAX_ADDITIONAL_LOOKS_PER_PURCHASE = 20;

export interface CreateBuyMoreLooksCheckoutInput {
  sessionId: string;
  userId: string;
  quantity: number;
  successUrl: string;
  cancelUrl: string;
}

export async function createBuyMoreLooksCheckout(
  input: CreateBuyMoreLooksCheckoutInput
) {
  if (
    !Number.isInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > MAX_ADDITIONAL_LOOKS_PER_PURCHASE
  ) {
    throw new Error(
      `quantity must be an integer between 1 and ${MAX_ADDITIONAL_LOOKS_PER_PURCHASE}`
    );
  }

  const session = await prisma.session.findUnique({
    where: { id: input.sessionId },
    select: {
      id: true,
      clientId: true,
      planType: true,
      status: true,
    },
  });
  if (!session || session.clientId !== input.userId) {
    throw new Error("Session not found");
  }
  if (session.status === "COMPLETED" || session.status === "CANCELLED") {
    throw new Error("Cannot buy more looks on a completed or cancelled session");
  }

  const plan = await getPlanByType(session.planType);
  if (!plan) {
    throw new Error(`Plan ${session.planType} not found`);
  }

  const totalInCents = plan.additionalLookPriceCents * input.quantity;
  const customerId = await getOrCreateStripeCustomer(input.userId);

  return stripe.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: plan.currency,
          unit_amount: plan.additionalLookPriceCents,
          product_data: {
            name: "Additional Style Board",
            description: `${input.quantity} extra board${input.quantity === 1 ? "" : "s"} for this session`,
          },
        },
        quantity: input.quantity,
      },
    ],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: {
      purpose: "BUY_MORE_LOOKS",
      userId: input.userId,
      sessionId: session.id,
      quantity: String(input.quantity),
      totalInCents: String(totalInCents),
    },
  });
}

export async function applyBuyMoreLooksFromCheckout(
  checkoutSession: Stripe.Checkout.Session
) {
  const { sessionId, quantity, userId } = checkoutSession.metadata ?? {};
  if (!sessionId || !quantity || !userId) {
    console.error(
      "[stripe] applyBuyMoreLooksFromCheckout: missing metadata",
      checkoutSession.id
    );
    return;
  }

  const qty = Number(quantity);
  if (
    !Number.isInteger(qty) ||
    qty < 1 ||
    qty > MAX_ADDITIONAL_LOOKS_PER_PURCHASE
  ) {
    console.error(
      "[stripe] applyBuyMoreLooksFromCheckout: invalid quantity",
      quantity
    );
    return;
  }

  const paymentIntentId =
    typeof checkoutSession.payment_intent === "string"
      ? checkoutSession.payment_intent
      : checkoutSession.payment_intent?.id ?? null;
  if (!paymentIntentId) {
    console.error(
      "[stripe] applyBuyMoreLooksFromCheckout: no payment_intent",
      checkoutSession.id
    );
    return;
  }

  const existingPayment = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: paymentIntentId },
    select: { id: true },
  });
  if (existingPayment) return; // idempotent

  const amountPaid = checkoutSession.amount_total ?? 0;

  // Defense in depth: Stripe-signed metadata carries an expected total;
  // reject if the charged amount doesn't match, so tampered/replayed events
  // can't grant entitlement at the wrong price.
  const expectedTotal = Number(checkoutSession.metadata?.totalInCents);
  if (
    !Number.isFinite(expectedTotal) ||
    expectedTotal !== amountPaid
  ) {
    console.error(
      "[stripe] applyBuyMoreLooksFromCheckout: amount mismatch",
      { checkoutSessionId: checkoutSession.id, expectedTotal, amountPaid }
    );
    return;
  }

  const currency = checkoutSession.currency ?? "usd";

  await prisma.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: sessionId },
      data: {
        styleboardsAllowed: { increment: qty },
        bonusBoardsGranted: { increment: qty },
      },
    });

    await tx.payment.create({
      data: {
        userId,
        sessionId,
        type: "UPGRADE",
        status: "SUCCEEDED",
        amountInCents: amountPaid,
        currency,
        stripePaymentIntentId: paymentIntentId,
        description: `Buy More Looks: ${qty} additional board${qty === 1 ? "" : "s"}`,
      },
    });

    await openAction(sessionId, "PENDING_STYLEBOARD", { tx });
  });
}
