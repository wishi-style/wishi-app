import { prisma } from "@/lib/prisma";
import { getPlanByType } from "@/lib/plans";
import { matchStylistForSession } from "@/lib/services/match.service";
import type { PlanType } from "@/generated/prisma/client";

// E2E / demo-only path that stands in for the Stripe checkout → webhook chain.
// Creates the Session (+ Subscription for recurring plans) and a synthetic
// Payment row marked SUCCEEDED, then runs the auto-matcher. Production must
// never reach this code: the caller is responsible for checking
// isE2EAuthModeEnabled() before invoking.
export async function provisionSessionForE2E(params: {
  userId: string;
  planType: PlanType;
  stylistUserId?: string;
  isSubscription: boolean;
}): Promise<{ sessionId: string }> {
  const plan = await getPlanByType(params.planType);
  if (!plan) {
    throw new Error(`No active plan for type: ${params.planType}`);
  }

  const syntheticPaymentIntentId = `e2e_pi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const sessionId = await prisma.$transaction(async (tx) => {
    let subscriptionId: string | null = null;
    if (params.isSubscription) {
      const sub = await tx.subscription.create({
        data: {
          userId: params.userId,
          stylistId: params.stylistUserId ?? null,
          planType: params.planType,
          status: plan.trialDays ? "TRIALING" : "ACTIVE",
          stripeSubscriptionId: `e2e_sub_${Date.now()}`,
          stripePriceId: plan.stripePriceIdSubscription ?? null,
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

    await tx.payment.create({
      data: {
        userId: params.userId,
        sessionId: created.id,
        type: "SESSION",
        status: "SUCCEEDED",
        amountInCents: plan.priceInCents,
        stripePaymentIntentId: params.isSubscription ? null : syntheticPaymentIntentId,
      },
    });

    return created.id;
  });

  await matchStylistForSession(sessionId);
  return { sessionId };
}
