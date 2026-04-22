import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getOrCreateStripeCustomer } from "./stripe-customer";
import { getPlanByType } from "@/lib/plans";
import type { PlanType } from "@/generated/prisma/client";

const UPGRADE_PATHS: Record<PlanType, PlanType[]> = {
  MINI: ["MAJOR", "LUX"],
  MAJOR: ["LUX"],
  LUX: [],
};

export interface CreateUpgradeCheckoutInput {
  sessionId: string;
  userId: string;
  targetPlan: PlanType;
  successUrl: string;
  cancelUrl: string;
}

export async function createUpgradeCheckout(input: CreateUpgradeCheckoutInput) {
  const session = await prisma.session.findUnique({
    where: { id: input.sessionId },
    select: {
      id: true,
      clientId: true,
      planType: true,
      amountPaidInCents: true,
      status: true,
      upgradedAt: true,
    },
  });
  if (!session || session.clientId !== input.userId) {
    throw new Error("Session not found");
  }
  if (session.status === "COMPLETED" || session.status === "CANCELLED") {
    throw new Error("Cannot upgrade a completed or cancelled session");
  }

  const validTargets = UPGRADE_PATHS[session.planType];
  if (!validTargets.includes(input.targetPlan)) {
    throw new Error(
      `Cannot upgrade from ${session.planType} to ${input.targetPlan}`
    );
  }

  const targetPlan = await getPlanByType(input.targetPlan);
  if (!targetPlan || !targetPlan.stripePriceIdOneTime) {
    throw new Error(`No one-time price configured for ${input.targetPlan}`);
  }

  const deltaInCents = targetPlan.priceInCents - session.amountPaidInCents;
  if (deltaInCents <= 0) {
    throw new Error("Upgrade delta must be positive");
  }

  const customerId = await getOrCreateStripeCustomer(input.userId);

  return stripe.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: targetPlan.currency,
          unit_amount: deltaInCents,
          product_data: {
            name: `Upgrade to ${targetPlan.name}`,
            description: `Plan upgrade from ${session.planType} to ${input.targetPlan}`,
          },
        },
        quantity: 1,
      },
    ],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: {
      purpose: "UPGRADE",
      userId: input.userId,
      sessionId: session.id,
      fromPlanType: session.planType,
      toPlanType: input.targetPlan,
    },
  });
}

export async function applyUpgradeFromCheckout(
  checkoutSession: Stripe.Checkout.Session
) {
  const { sessionId, fromPlanType, toPlanType, userId } =
    checkoutSession.metadata ?? {};
  if (!sessionId || !fromPlanType || !toPlanType || !userId) {
    console.error(
      "[stripe] applyUpgradeFromCheckout: missing metadata",
      checkoutSession.id
    );
    return;
  }

  const paymentIntentId =
    typeof checkoutSession.payment_intent === "string"
      ? checkoutSession.payment_intent
      : checkoutSession.payment_intent?.id ?? null;

  if (!paymentIntentId) {
    console.error(
      "[stripe] applyUpgradeFromCheckout: no payment_intent",
      checkoutSession.id
    );
    return;
  }

  const existingPayment = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: paymentIntentId },
    select: { id: true },
  });
  if (existingPayment) return; // idempotent

  const targetPlan = await getPlanByType(toPlanType as PlanType);
  if (!targetPlan) {
    console.error("[stripe] applyUpgradeFromCheckout: unknown plan", toPlanType);
    return;
  }

  const amountPaid = checkoutSession.amount_total ?? 0;

  await prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      select: {
        planType: true,
        styleboardsAllowed: true,
        moodboardsAllowed: true,
        amountPaidInCents: true,
      },
    });
    if (!session) throw new Error(`Session ${sessionId} not found`);

    // Guard against double-apply: the session must still be on the plan the
    // upgrade was authorized from. If another upgrade has already landed,
    // skip the session mutation — the Payment row is still written below so
    // the money is recorded and admins can reconcile.
    const alreadyUpgraded = session.planType !== fromPlanType;
    if (alreadyUpgraded) {
      console.warn(
        "[stripe] applyUpgradeFromCheckout: session already upgraded",
        { sessionId, expected: fromPlanType, actual: session.planType }
      );
    } else {
      await tx.session.update({
        where: { id: sessionId },
        data: {
          planType: toPlanType as PlanType,
          styleboardsAllowed: targetPlan.styleboards,
          moodboardsAllowed: targetPlan.moodboards,
          amountPaidInCents: session.amountPaidInCents + amountPaid,
          upgradedAt: new Date(),
          upgradedFromPlanType: session.planType,
        },
      });
    }

    await tx.payment.create({
      data: {
        userId,
        sessionId,
        type: "UPGRADE",
        status: "SUCCEEDED",
        amountInCents: amountPaid,
        currency: targetPlan.currency,
        stripePaymentIntentId: paymentIntentId,
        description: alreadyUpgraded
          ? `Upgrade payment received (session already on ${session.planType})`
          : `Upgrade to ${targetPlan.name}`,
      },
    });
  });
}
