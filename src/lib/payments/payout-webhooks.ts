// Stripe webhook handlers for Connect + payout + tip events.
// Split from webhook-handlers.ts (checkout/subscription/invoice) because
// these events hit different tables and have different failure modes.

import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { accountIsPayoutReady } from "@/lib/stripe-connect";
import { dispatchNotification } from "@/lib/notifications/dispatcher";

// ── transfer.paid ──────────────────────────────────────────────────────────
// Fires when Stripe confirms the platform-to-connected-account transfer has
// landed in the stylist's available balance. We flip the Payout row to
// COMPLETED and notify the stylist.
export async function handleTransferPaid(transfer: Stripe.Transfer): Promise<void> {
  const payout = await prisma.payout.findUnique({
    where: { stripeTransferId: transfer.id },
    select: { id: true, status: true, stylistProfile: { select: { userId: true } } },
  });
  if (!payout) {
    console.warn("[stripe] transfer.paid for unknown transfer", { id: transfer.id });
    return;
  }
  if (payout.status === "COMPLETED") return;
  await prisma.payout.update({
    where: { id: payout.id },
    data: { status: "COMPLETED", reconciledAt: new Date() },
  });
  if (payout.stylistProfile.userId) {
    await dispatchNotification({
      event: "payout.completed",
      userId: payout.stylistProfile.userId,
      title: "Payout arrived",
      body: "Your payout is now available in your Stripe balance.",
      url: "/stylist/payouts",
    }).catch(() => undefined);
  }
}

// ── transfer.failed ────────────────────────────────────────────────────────
export async function handleTransferFailed(transfer: Stripe.Transfer): Promise<void> {
  const payout = await prisma.payout.findUnique({
    where: { stripeTransferId: transfer.id },
    select: { id: true, stylistProfile: { select: { userId: true } } },
  });
  if (!payout) return;
  await prisma.payout.update({
    where: { id: payout.id },
    data: { status: "FAILED", skippedReason: "stripe_transfer_failed", reconciledAt: new Date() },
  });
  if (payout.stylistProfile.userId) {
    await dispatchNotification({
      event: "payout.failed",
      userId: payout.stylistProfile.userId,
      title: "Payout issue",
      body: "A payout failed to process — support will be in touch.",
    }).catch(() => undefined);
  }
}

// ── account.updated ────────────────────────────────────────────────────────
// Flips StylistProfile.payoutsEnabled when the Connect account becomes
// eligible for transfers, and advances onboardingStatus so the proxy
// redirect lets them into /stylist/*.
export async function handleAccountUpdated(account: Stripe.Account): Promise<void> {
  const stylistProfileId = typeof account.metadata?.stylistProfileId === "string"
    ? account.metadata.stylistProfileId
    : null;

  const profile = stylistProfileId
    ? await prisma.stylistProfile.findUnique({
        where: { id: stylistProfileId },
        select: { id: true, payoutsEnabled: true, onboardingStatus: true },
      })
    : await prisma.stylistProfile.findUnique({
        where: { stripeConnectId: account.id },
        select: { id: true, payoutsEnabled: true, onboardingStatus: true },
      });

  if (!profile) {
    console.warn("[stripe] account.updated for unknown profile", { accountId: account.id });
    return;
  }

  const ready = accountIsPayoutReady(account);
  const advance =
    ready && profile.onboardingStatus !== "AWAITING_ELIGIBILITY" && profile.onboardingStatus !== "ELIGIBLE";

  await prisma.stylistProfile.update({
    where: { id: profile.id },
    data: {
      payoutsEnabled: ready,
      stripeConnectId: account.id,
      ...(advance ? { onboardingStatus: "STRIPE_CONNECTED" } : {}),
    },
  });
}

// ── payment_intent.succeeded (tip only) ────────────────────────────────────
// Handles the durable write for tips. The end-session Server Action writes
// Session.rating/reviewText immediately, but tipInCents + Payment(type=TIP)
// wait on this webhook so the UI can't drift from Stripe's settled state.
export async function handleTipPaymentSucceeded(pi: Stripe.PaymentIntent): Promise<void> {
  const sessionId = typeof pi.metadata?.sessionId === "string" ? pi.metadata.sessionId : null;
  const purpose = pi.metadata?.purpose;
  if (!sessionId || purpose !== "tip") return;

  const existing = await prisma.payment.findFirst({
    where: { stripePaymentIntentId: pi.id },
    select: { id: true },
  });
  if (existing) return;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, clientId: true, tipInCents: true },
  });
  if (!session) return;

  await prisma.$transaction([
    prisma.session.update({
      where: { id: sessionId },
      data: { tipInCents: pi.amount, stripeTipPaymentId: pi.id },
    }),
    prisma.payment.create({
      data: {
        userId: session.clientId,
        sessionId,
        type: "TIP",
        status: "SUCCEEDED",
        amountInCents: pi.amount,
        currency: pi.currency ?? "usd",
        stripePaymentIntentId: pi.id,
      },
    }),
  ]);
}
