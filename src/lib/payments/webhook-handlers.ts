import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getPlanByType } from "@/lib/plans";
import { matchStylistForSession } from "@/lib/services/match.service";
import type { PlanType, SubscriptionStatus } from "@/generated/prisma/client";
import {
  buildCheckoutRecoveryPlan,
  buildSessionRecoveryPlan,
} from "./webhook-recovery";
import { applyUpgradeFromCheckout } from "./session-upgrade.service";
import { applyBuyMoreLooksFromCheckout } from "./buy-more-looks.service";

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const purpose = session.metadata?.purpose;
  if (purpose === "UPGRADE") {
    await applyUpgradeFromCheckout(session);
    return;
  }
  if (purpose === "BUY_MORE_LOOKS") {
    await applyBuyMoreLooksFromCheckout(session);
    return;
  }

  const { userId, planType, stylistUserId } = session.metadata ?? {};
  if (!userId || !planType) {
    console.error("[stripe] Missing metadata on checkout session", session.id);
    return;
  }

  const plan = await getPlanByType(planType as PlanType);
  if (!plan) {
    console.error("[stripe] Unknown plan type", planType);
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  let localSession = paymentIntentId
    ? await prisma.session.findUnique({
        where: { stripePaymentIntentId: paymentIntentId },
        select: { id: true, status: true, stylistId: true },
      })
    : null;

  const existingPayment = paymentIntentId
    ? await prisma.payment.findUnique({
        where: { stripePaymentIntentId: paymentIntentId },
        select: { id: true },
      })
    : null;

  const recoveryPlan = buildCheckoutRecoveryPlan({
    existingSession: localSession,
    hasPayment: !!existingPayment,
    explicitStylistUserId: stylistUserId,
  });

  if (recoveryPlan.shouldCreateSession) {
    localSession = await prisma.$transaction(async (tx) => {
      const createdSession = await tx.session.create({
        data: {
          clientId: userId,
          stylistId: stylistUserId || null,
          planType: planType as PlanType,
          status: "BOOKED",
          amountPaidInCents: session.amount_total ?? plan.priceInCents,
          styleboardsAllowed: plan.styleboards,
          moodboardsAllowed: plan.moodboards,
          stripePaymentIntentId: paymentIntentId,
        },
        select: { id: true, status: true, stylistId: true },
      });

      if (recoveryPlan.shouldCreatePayment) {
        await createOrUpdatePaymentRecord({
          amountInCents: session.amount_total ?? plan.priceInCents,
          paymentIntentId,
          sessionId: createdSession.id,
          tx,
          userId,
        });
      }

      return createdSession;
    });
  } else if (recoveryPlan.shouldCreatePayment && localSession) {
    await createOrUpdatePaymentRecord({
      amountInCents: session.amount_total ?? plan.priceInCents,
      paymentIntentId,
      sessionId: localSession.id,
      tx: prisma,
      userId,
    });
  }

  if (localSession && recoveryPlan.shouldAutoMatch) {
    await matchStylistForSession(localSession.id);
  }
}

export async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const { userId, planType, stylistUserId } = subscription.metadata ?? {};
  if (!userId || !planType) {
    console.error("[stripe] Missing metadata on subscription", subscription.id);
    return;
  }

  const plan = await getPlanByType(planType as PlanType);
  if (!plan) return;

  let localSub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
    select: { id: true },
  });

  let bootstrapSession = localSub
    ? await prisma.session.findFirst({
        where: { subscriptionId: localSub.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, status: true, stylistId: true },
      })
    : null;

  if (!localSub || !bootstrapSession) {
    const result = await prisma.$transaction(async (tx) => {
      const ensuredSub = localSub ?? await tx.subscription.create({
        data: {
          userId,
          stylistId: stylistUserId || null,
          planType: planType as PlanType,
          status: "TRIALING",
          stripeSubscriptionId: subscription.id,
          stripePriceId: subscription.items.data[0]?.price?.id ?? null,
          trialEndsAt: subscription.trial_end
            ? new Date(subscription.trial_end * 1000)
            : null,
          currentPeriodStart: subscription.items.data[0]?.current_period_start
            ? new Date(subscription.items.data[0].current_period_start * 1000)
            : new Date(subscription.start_date * 1000),
          currentPeriodEnd: subscription.items.data[0]?.current_period_end
            ? new Date(subscription.items.data[0].current_period_end * 1000)
            : null,
        },
        select: { id: true },
      });

      const ensuredSession = bootstrapSession ?? await tx.session.create({
        data: {
          clientId: userId,
          stylistId: stylistUserId || null,
          planType: planType as PlanType,
          status: "BOOKED",
          amountPaidInCents: plan.priceInCents,
          styleboardsAllowed: plan.styleboards,
          moodboardsAllowed: plan.moodboards,
          isMembership: true,
          subscriptionId: ensuredSub.id,
        },
        select: { id: true, status: true, stylistId: true },
      });

      return { ensuredSub, ensuredSession };
    });

    localSub = result.ensuredSub;
    bootstrapSession = result.ensuredSession;
  }

  const recoveryPlan = buildSessionRecoveryPlan({
    existingSession: bootstrapSession,
    explicitStylistUserId: stylistUserId,
  });

  if (bootstrapSession && recoveryPlan.shouldAutoMatch) {
    await matchStylistForSession(bootstrapSession.id);
  }
}

export async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const statusMap: Record<string, SubscriptionStatus> = {
    trialing: "TRIALING",
    active: "ACTIVE",
    past_due: "PAST_DUE",
    paused: "PAUSED",
    canceled: "CANCELLED",
    unpaid: "PAST_DUE",
  };

  const localStatus = statusMap[subscription.status] ?? "ACTIVE";

  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status: localStatus,
      currentPeriodStart: subscription.items.data[0]?.current_period_start
        ? new Date(subscription.items.data[0].current_period_start * 1000)
        : new Date(subscription.start_date * 1000),
      currentPeriodEnd: subscription.items.data[0]?.current_period_end
        ? new Date(subscription.items.data[0].current_period_end * 1000)
        : null,
      cancelledAt:
        subscription.status === "canceled" ? new Date() : undefined,
    },
  });
}

export async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const localSub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });
  if (!localSub) return;

  await prisma.subscription.update({
    where: { id: localSub.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
    },
  });

  // Cancel any linked BOOKED sessions
  await prisma.session.updateMany({
    where: {
      subscriptionId: localSub.id,
      status: "BOOKED",
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
    },
  });
}

function getSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const sub = invoice.parent?.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}

export async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const subId = getSubscriptionIdFromInvoice(invoice);
  if (!subId) return;

  // Skip the initial invoice — the session was already created in subscription.created
  if (invoice.billing_reason === "subscription_create") return;

  const localSub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subId },
  });
  if (!localSub) return;

  const periodStart = invoice.period_start ? new Date(invoice.period_start * 1000) : null;
  const periodEnd = invoice.period_end ? new Date(invoice.period_end * 1000) : null;
  let renewalSession = periodStart
    ? await prisma.session.findFirst({
        where: {
          subscriptionId: localSub.id,
          createdAt: {
            gte: periodStart,
            ...(periodEnd ? { lte: periodEnd } : {}),
          },
        },
        select: { id: true, status: true, stylistId: true },
      })
    : null;

  const plan = await getPlanByType(localSub.planType);
  if (!plan) return;

  if (!renewalSession) {
    renewalSession = await prisma.session.create({
      data: {
        clientId: localSub.userId,
        stylistId: localSub.stylistId,
        planType: localSub.planType,
        status: "BOOKED",
        amountPaidInCents: plan.priceInCents,
        styleboardsAllowed: plan.styleboards,
        moodboardsAllowed: plan.moodboards,
        isMembership: true,
        subscriptionId: localSub.id,
      },
      select: { id: true, status: true, stylistId: true },
    });
  }

  const recoveryPlan = buildSessionRecoveryPlan({
    existingSession: renewalSession,
    explicitStylistUserId: localSub.stylistId,
  });

  if (renewalSession && recoveryPlan.shouldAutoMatch) {
    await matchStylistForSession(renewalSession.id);
  }
}

export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subId = getSubscriptionIdFromInvoice(invoice);
  if (!subId) return;

  const localSub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subId },
  });
  if (!localSub) return;

  await prisma.subscription.update({
    where: { id: localSub.id },
    data: {
      status: "PAST_DUE",
      lastPaymentFailedAt: new Date(),
      paymentRetryCount: { increment: 1 },
    },
  });

  // Freeze linked active sessions
  await prisma.session.updateMany({
    where: {
      subscriptionId: localSub.id,
      status: { in: ["BOOKED", "ACTIVE"] },
    },
    data: {
      status: "FROZEN",
      frozenAt: new Date(),
      frozenReason: "subscription_payment_failed",
    },
  });
}

async function createOrUpdatePaymentRecord({
  amountInCents,
  paymentIntentId,
  sessionId,
  tx,
  userId,
}: {
  amountInCents: number;
  paymentIntentId: string | null;
  sessionId: string;
  tx: { payment: typeof prisma.payment };
  userId: string;
}) {
  if (paymentIntentId) {
    await tx.payment.upsert({
      where: { stripePaymentIntentId: paymentIntentId },
      update: {
        amountInCents,
        sessionId,
        status: "SUCCEEDED",
        type: "SESSION",
        userId,
      },
      create: {
        userId,
        sessionId,
        type: "SESSION",
        status: "SUCCEEDED",
        amountInCents,
        stripePaymentIntentId: paymentIntentId,
      },
    });
    return;
  }

  await tx.payment.create({
    data: {
      userId,
      sessionId,
      type: "SESSION",
      status: "SUCCEEDED",
      amountInCents,
      stripePaymentIntentId: null,
    },
  });
}
