// Stripe webhook handlers for Connect + payout + tip events.
// Split from webhook-handlers.ts (checkout/subscription/invoice) because
// these events hit different tables and have different failure modes.

import type Stripe from "stripe";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { accountIsPayoutReady } from "@/lib/stripe-connect";
import { dispatchNotification } from "@/lib/notifications/dispatcher";

type PayoutLookupRow = {
  id: string;
  status: string;
  stylistProfile: { userId: string | null };
};

// Stripe can deliver transfer.* events before dispatch.service.ts finishes
// writing `stripeTransferId` onto the Payout row. Fall back to
// `transfer.metadata.payoutId` (dispatch.service.ts always sets this) so the
// early-webhook race doesn't leave payouts stuck in PROCESSING.
async function findPayoutForTransfer(
  transfer: Stripe.Transfer,
): Promise<PayoutLookupRow | null> {
  const byTransferId = await prisma.payout.findUnique({
    where: { stripeTransferId: transfer.id },
    select: { id: true, status: true, stylistProfile: { select: { userId: true } } },
  });
  if (byTransferId) return byTransferId;

  const payoutId =
    typeof transfer.metadata?.payoutId === "string" ? transfer.metadata.payoutId : null;
  if (!payoutId) return null;

  return prisma.payout.findUnique({
    where: { id: payoutId },
    select: { id: true, status: true, stylistProfile: { select: { userId: true } } },
  });
}

// ── transfer.created ───────────────────────────────────────────────────────
// Our own code already flips Payout to PROCESSING right after
// stripe.transfers.create returns. The webhook is the authoritative
// confirmation — we mark COMPLETED because the platform-to-connected-account
// transfer has landed in the stylist's Stripe balance (their own bank payout
// is async and not our responsibility to track).
export async function handleTransferPaid(transfer: Stripe.Transfer): Promise<void> {
  const payout = await findPayoutForTransfer(transfer);
  if (!payout) {
    console.warn("[stripe] transfer.paid for unknown transfer", { id: transfer.id });
    return;
  }
  if (payout.status === "COMPLETED") return;
  await prisma.payout.update({
    where: { id: payout.id },
    data: {
      status: "COMPLETED",
      stripeTransferId: transfer.id,
      reconciledAt: new Date(),
    },
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
  const payout = await findPayoutForTransfer(transfer);
  if (!payout) {
    console.warn("[stripe] transfer.failed for unknown transfer", { id: transfer.id });
    return;
  }
  await prisma.payout.update({
    where: { id: payout.id },
    data: {
      status: "FAILED",
      skippedReason: "stripe_transfer_failed",
      stripeTransferId: transfer.id,
      reconciledAt: new Date(),
    },
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

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, clientId: true, tipInCents: true },
  });
  if (!session) return;

  // findFirst → create isn't atomic under concurrent/retried webhook delivery,
  // so we attempt the transaction and treat P2002 (unique violation on
  // stripePaymentIntentId) as a successful idempotent replay. The Session
  // update is idempotent (same pi.id, same pi.amount) so the entire handler
  // is safe to run twice for the same PaymentIntent.
  try {
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
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return;
    }
    throw error;
  }
}
