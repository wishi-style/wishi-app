// Payout dispatch — the single place where Payout rows are written and
// Stripe Transfers are created. Called from:
//   - src/lib/sessions/transitions.ts `approveEnd` → SESSION_COMPLETED | LUX_FINAL
//   - src/lib/boards/styleboard.service.ts `sendStyleboard` → LUX_THIRD_LOOK
//
// Idempotency: the Payout table has @@unique([sessionId, trigger]), so a re-run
// for the same (sessionId, trigger) pair is a no-op. This matters because the
// Lux milestone hook could fire twice if look 3 is re-sent, and approveEnd can
// be re-entered safely from the end-session webhook path.

import { prisma } from "@/lib/prisma";
import { completionTriggerFor, computePayoutAmount, isLuxPlan } from "@/lib/payouts/policy";
import { createTransfer } from "@/lib/stripe-connect";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import type { PayoutTrigger } from "@/generated/prisma/client";

export type DispatchInput = {
  sessionId: string;
  trigger: PayoutTrigger;
  // Test seam: swap the Stripe transfer call without monkey-patching the
  // stripe-connect module. Integration tests pass a mock that returns a fake
  // transfer id; callers in production code omit this.
  deps?: {
    createTransfer?: typeof createTransfer;
  };
};

export type DispatchResult =
  | { status: "SKIPPED"; reason: "idempotent" | "in_house_stylist" | "connect_not_ready" }
  | { status: "CREATED"; payoutId: string };

const IDEMPOTENT_SKIP: DispatchResult = { status: "SKIPPED", reason: "idempotent" };

export async function dispatchPayout(input: DispatchInput): Promise<DispatchResult> {
  const { sessionId, trigger } = input;
  const transferImpl = input.deps?.createTransfer ?? createTransfer;

  // Guard: the unique constraint prevents duplicate rows at the DB level, but
  // we check first so we can skip the Stripe call + return a meaningful status.
  const existing = await prisma.payout.findUnique({
    where: { sessionId_trigger: { sessionId, trigger } },
    select: { id: true },
  });
  if (existing) return IDEMPOTENT_SKIP;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      tipInCents: true,
      stylistId: true,
      planType: true,
    },
  });
  if (!session) throw new Error(`dispatchPayout: session ${sessionId} not found`);
  if (!session.stylistId) {
    throw new Error(`dispatchPayout: session ${sessionId} has no stylist`);
  }

  const [plan, stylistProfile] = await Promise.all([
    prisma.plan.findUnique({
      where: { type: session.planType },
      select: {
        priceInCents: true,
        payoutTrigger: true,
        luxMilestoneAmountCents: true,
        luxMilestoneLookNumber: true,
      },
    }),
    prisma.stylistProfile.findUnique({
      where: { userId: session.stylistId },
      select: {
        id: true,
        stylistType: true,
        stripeConnectId: true,
        payoutsEnabled: true,
        payoutPercentage: true,
      },
    }),
  ]);

  if (!plan) throw new Error(`dispatchPayout: plan ${session.planType} missing`);
  if (!stylistProfile) {
    throw new Error(`dispatchPayout: stylist ${session.stylistId} has no profile`);
  }

  const { amountCents, tipCents } = computePayoutAmount({
    plan,
    session: { tipInCents: session.tipInCents },
    stylist: { payoutPercentage: stylistProfile.payoutPercentage },
    trigger,
  });

  const baseData = {
    sessionId,
    stylistProfileId: stylistProfile.id,
    trigger,
    amountInCents: amountCents,
    tipInCents: tipCents,
    triggeredAt: new Date(),
  };

  // IN_HOUSE: write the row with status=SKIPPED so bookkeeping is complete,
  // but never touch Stripe.
  if (stylistProfile.stylistType === "IN_HOUSE") {
    const row = await prisma.payout.create({
      data: { ...baseData, status: "SKIPPED", skippedReason: "in_house_stylist" },
    });
    return { status: "CREATED", payoutId: row.id };
  }

  // PLATFORM but Connect not finished — persist a PENDING row so the CRM can
  // flag it, but don't call Stripe. The `account.updated` webhook flips
  // payoutsEnabled later; a nudge job (Phase 7+) retries these.
  if (!stylistProfile.stripeConnectId || !stylistProfile.payoutsEnabled) {
    const row = await prisma.payout.create({
      data: { ...baseData, status: "PENDING", skippedReason: "connect_not_ready" },
    });
    return { status: "CREATED", payoutId: row.id };
  }

  // Happy path: PLATFORM stylist with Connect enabled.
  const row = await prisma.payout.create({
    data: { ...baseData, status: "PENDING" },
  });

  try {
    const transfer = await transferImpl({
      destination: stylistProfile.stripeConnectId,
      amountCents,
      transferGroup: `session_${sessionId}`,
      description: `${trigger} payout for session ${sessionId}`,
      metadata: { sessionId, trigger, payoutId: row.id },
    });
    await prisma.payout.update({
      where: { id: row.id },
      data: { status: "PROCESSING", stripeTransferId: transfer.id },
    });
  } catch (error) {
    console.error("[payouts] createTransfer failed", { sessionId, trigger, error });
    await prisma.payout.update({
      where: { id: row.id },
      data: { status: "FAILED", skippedReason: "stripe_transfer_error" },
    });
    await dispatchNotification({
      event: "payout.failed",
      userId: session.stylistId,
      title: "Payout issue",
      body: "We hit a problem sending your payout — support will follow up.",
    }).catch(() => undefined);
    return { status: "CREATED", payoutId: row.id };
  }

  await dispatchNotification({
    event: "payout.queued",
    userId: session.stylistId,
    title: "Payout on the way",
    body: `$${(amountCents / 100).toFixed(2)} is heading to your account.`,
    url: "/stylist/payouts",
  }).catch(() => undefined);

  return { status: "CREATED", payoutId: row.id };
}

export { completionTriggerFor, isLuxPlan };
