import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getPlanByType } from "@/lib/plans";
import { matchStylistForSession } from "@/lib/services/match.service";
import type { PlanType, SubscriptionStatus } from "@/generated/prisma/client";

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const { userId, planType, stylistId } = session.metadata ?? {};
  if (!userId || !planType) {
    console.error("[stripe] Missing metadata on checkout session", session.id);
    return;
  }

  const plan = await getPlanByType(planType as PlanType);
  if (!plan) {
    console.error("[stripe] Unknown plan type", planType);
    return;
  }

  // Create session record
  const newSession = await prisma.session.create({
    data: {
      clientId: userId,
      stylistId: stylistId || null,
      planType: planType as PlanType,
      status: "BOOKED",
      amountPaidInCents: session.amount_total ?? plan.priceInCents,
      styleboardsAllowed: plan.styleboards,
      moodboardsAllowed: plan.moodboards,
      stripePaymentIntentId:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null,
    },
  });

  // Create payment record
  await prisma.payment.create({
    data: {
      userId,
      sessionId: newSession.id,
      type: "SESSION",
      status: "SUCCEEDED",
      amountInCents: session.amount_total ?? plan.priceInCents,
      stripePaymentIntentId:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null,
    },
  });

  // Run auto-matcher
  await matchStylistForSession(newSession.id);
}

export async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const { userId, planType, stylistId } = subscription.metadata ?? {};
  if (!userId || !planType) {
    console.error("[stripe] Missing metadata on subscription", subscription.id);
    return;
  }

  const plan = await getPlanByType(planType as PlanType);
  if (!plan) return;

  // Create local subscription record
  const localSub = await prisma.subscription.create({
    data: {
      userId,
      stylistId: stylistId || null,
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
  });

  // Create first session for this subscription
  const newSession = await prisma.session.create({
    data: {
      clientId: userId,
      stylistId: stylistId || null,
      planType: planType as PlanType,
      status: "BOOKED",
      amountPaidInCents: plan.priceInCents,
      styleboardsAllowed: plan.styleboards,
      moodboardsAllowed: plan.moodboards,
      isMembership: true,
      subscriptionId: localSub.id,
    },
  });

  await matchStylistForSession(newSession.id);
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

  const localSub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subId },
  });
  if (!localSub) return;

  // Skip first invoice (session already created on subscription.created)
  const sessionCount = await prisma.session.count({
    where: { subscriptionId: localSub.id },
  });
  if (sessionCount <= 1) return;

  const plan = await getPlanByType(localSub.planType);
  if (!plan) return;

  // Create new session for this billing cycle
  const newSession = await prisma.session.create({
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
  });

  await matchStylistForSession(newSession.id);
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
