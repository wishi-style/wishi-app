import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import type { PlanType, SubscriptionFrequency } from "@/generated/prisma/client";

export async function cancelSubscription(subscriptionId: string, userId: string) {
  const sub = await getOwnedSubscription(subscriptionId, userId);

  if (sub.status === "CANCELLED" || sub.status === "EXPIRED") {
    throw new Error("Subscription is already cancelled");
  }

  await stripe.subscriptions.update(sub.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { cancelRequestedAt: new Date() },
  });
}

export async function pauseSubscription(subscriptionId: string, userId: string) {
  const sub = await getOwnedSubscription(subscriptionId, userId);

  if (sub.status !== "ACTIVE") {
    throw new Error("Only active subscriptions can be paused");
  }

  await stripe.subscriptions.update(sub.stripeSubscriptionId, {
    pause_collection: { behavior: "void" },
  });

  const nextPeriodEnd = sub.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd.getTime() + 30 * 24 * 60 * 60 * 1000)
    : null;

  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      status: "PAUSED",
      pausedUntil: nextPeriodEnd,
    },
  });
}

export async function downgradeSubscription(
  subscriptionId: string,
  userId: string,
  newPlanType: PlanType
) {
  const sub = await getOwnedSubscription(subscriptionId, userId);

  if (sub.status !== "ACTIVE" && sub.status !== "TRIALING") {
    throw new Error("Subscription must be active or trialing to downgrade");
  }

  if (newPlanType === "LUX") {
    throw new Error("Cannot downgrade to Lux — Lux is one-time only");
  }

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { pendingPlanType: newPlanType },
  });
}

export async function switchSubscriptionFrequency(
  subscriptionId: string,
  userId: string,
  newFrequency: SubscriptionFrequency
) {
  const sub = await getOwnedSubscription(subscriptionId, userId);

  if (sub.status !== "ACTIVE" && sub.status !== "TRIALING") {
    throw new Error("Subscription must be active or trialing to switch frequency");
  }

  if (sub.frequency === newFrequency) {
    return { alreadySet: true as const };
  }

  // Stripe price swap for MONTHLY ↔ QUARTERLY requires both price IDs configured
  // on the Plan row. Until quarterly Stripe prices are set up, we record intent
  // locally — the subscription-cycle worker will pick up the change at next cycle
  // once Plan.stripePriceIdSubscriptionQuarterly is populated.
  await prisma.subscription.update({
    where: { id: sub.id },
    data: { frequency: newFrequency },
  });

  return { alreadySet: false as const };
}

export async function retrySubscriptionPayment(
  subscriptionId: string,
  userId: string
) {
  const sub = await getOwnedSubscription(subscriptionId, userId);

  if (sub.status !== "PAST_DUE" && !sub.lastPaymentFailedAt) {
    throw new Error("No failed payment to retry");
  }

  // Find the latest open invoice on the Stripe subscription and pay it.
  const invoices = await stripe.invoices.list({
    subscription: sub.stripeSubscriptionId,
    status: "open",
    limit: 1,
  });
  const openInvoice = invoices.data[0];
  if (!openInvoice || !openInvoice.id) {
    throw new Error("No open invoice to retry");
  }

  const paid = await stripe.invoices.pay(openInvoice.id);

  // On successful pay, clear local failure state + unfreeze any linked frozen session.
  // Stripe webhook (invoice.payment_succeeded) also writes durable state — this is optimistic.
  if (paid.status === "paid") {
    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: "ACTIVE",
          lastPaymentFailedAt: null,
          paymentRetryCount: 0,
        },
      });
      await tx.session.updateMany({
        where: { subscriptionId: sub.id, status: "FROZEN" },
        data: { status: "ACTIVE", frozenAt: null, frozenReason: null },
      });
    });
  }

  return { status: paid.status };
}

export async function reactivateSubscription(subscriptionId: string, userId: string) {
  const sub = await getOwnedSubscription(subscriptionId, userId);

  if (!sub.cancelRequestedAt) {
    throw new Error("Subscription is not scheduled for cancellation");
  }

  await stripe.subscriptions.update(sub.stripeSubscriptionId, {
    cancel_at_period_end: false,
  });

  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      cancelRequestedAt: null,
      reactivatedAt: new Date(),
    },
  });
}

async function getOwnedSubscription(subscriptionId: string, userId: string) {
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });

  if (!sub || sub.userId !== userId) {
    throw new Error("Subscription not found");
  }

  return sub;
}

// ─── Admin overrides ─────────────────────────────────────
// Bypass user-ownership check. Audit is written at the call site.

async function loadSubscription(subscriptionId: string) {
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });
  if (!sub) throw new Error("Subscription not found");
  return sub;
}

export async function adminCancelSubscription(subscriptionId: string) {
  const sub = await loadSubscription(subscriptionId);
  if (sub.status === "CANCELLED" || sub.status === "EXPIRED") {
    throw new Error("Subscription is already cancelled");
  }
  await stripe.subscriptions.update(sub.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
  await prisma.subscription.update({
    where: { id: sub.id },
    data: { cancelRequestedAt: new Date() },
  });
}

export async function adminPauseSubscription(subscriptionId: string) {
  const sub = await loadSubscription(subscriptionId);
  if (sub.status !== "ACTIVE") {
    throw new Error("Only active subscriptions can be paused");
  }
  await stripe.subscriptions.update(sub.stripeSubscriptionId, {
    pause_collection: { behavior: "void" },
  });
  const nextPeriodEnd = sub.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd.getTime() + 30 * 24 * 60 * 60 * 1000)
    : null;
  await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: "PAUSED", pausedUntil: nextPeriodEnd },
  });
}

export async function adminReactivateSubscription(subscriptionId: string) {
  const sub = await loadSubscription(subscriptionId);
  if (sub.status === "PAUSED") {
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      pause_collection: "",
    });
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: "ACTIVE",
        pausedUntil: null,
        reactivatedAt: new Date(),
      },
    });
    return;
  }
  if (sub.cancelRequestedAt) {
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { cancelRequestedAt: null, reactivatedAt: new Date() },
    });
    return;
  }
  throw new Error("Subscription is not paused or scheduled for cancellation");
}
