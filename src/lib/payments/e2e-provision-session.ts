import { prisma } from "@/lib/prisma";
import { isE2EAuthModeEnabled } from "@/lib/auth/e2e-auth";
import { getPlanByType } from "@/lib/plans";
import { matchStylistForSession } from "@/lib/services/match.service";
import type { PlanType } from "@/generated/prisma/client";

function syntheticStripeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// E2E / demo-only path that stands in for the Stripe checkout → webhook chain.
// Creates the Session (+ Subscription for recurring plans) and, for one-time
// bookings, a synthetic SUCCEEDED Payment row, then runs the auto-matcher.
// Subscription bootstraps skip the Payment write to match the real Stripe
// flow — handleSubscriptionCreated doesn't write a Payment either (that
// happens later on invoice.payment_succeeded), so writing one here would
// inflate admin revenue metrics against trialing demo accounts.
export async function provisionSessionForE2E(params: {
  userId: string;
  planType: PlanType;
  stylistUserId?: string;
  isSubscription: boolean;
}): Promise<{ sessionId: string }> {
  if (!isE2EAuthModeEnabled()) {
    throw new Error(
      "provisionSessionForE2E may only be called when E2E_AUTH_MODE is enabled",
    );
  }

  const plan = await getPlanByType(params.planType);
  if (!plan) {
    throw new Error(`No active plan for type: ${params.planType}`);
  }

  if (params.isSubscription) {
    if (!plan.subscriptionAvailable || !plan.stripePriceIdSubscription) {
      throw new Error(
        `No subscription price found for plan: ${params.planType}`,
      );
    }
  }

  const syntheticPaymentIntentId = syntheticStripeId("e2e_pi");

  const sessionId = await prisma.$transaction(async (tx) => {
    let subscriptionId: string | null = null;
    if (params.isSubscription) {
      const sub = await tx.subscription.create({
        data: {
          userId: params.userId,
          stylistId: params.stylistUserId ?? null,
          planType: params.planType,
          status: plan.trialDays ? "TRIALING" : "ACTIVE",
          stripeSubscriptionId: syntheticStripeId("e2e_sub"),
          stripePriceId: plan.stripePriceIdSubscription,
          trialEndsAt: plan.trialDays
            ? new Date(Date.now() + plan.trialDays * 24 * 60 * 60 * 1000)
            : null,
          currentPeriodStart: new Date(),
          currentPeriodEnd: null,
        },
        select: { id: true },
      });
      subscriptionId = sub.id;
    }

    const created = await tx.session.create({
      data: {
        clientId: params.userId,
        stylistId: params.stylistUserId ?? null,
        planType: params.planType,
        status: "BOOKED",
        amountPaidInCents: plan.priceInCents,
        styleboardsAllowed: plan.styleboards,
        moodboardsAllowed: plan.moodboards,
        isMembership: params.isSubscription,
        subscriptionId,
        stripePaymentIntentId: params.isSubscription ? null : syntheticPaymentIntentId,
      },
      select: { id: true },
    });

    if (!params.isSubscription) {
      await tx.payment.create({
        data: {
          userId: params.userId,
          sessionId: created.id,
          type: "SESSION",
          status: "SUCCEEDED",
          amountInCents: plan.priceInCents,
          stripePaymentIntentId: syntheticPaymentIntentId,
        },
      });
    }

    return created.id;
  });

  await matchStylistForSession(sessionId);
  return { sessionId };
}
