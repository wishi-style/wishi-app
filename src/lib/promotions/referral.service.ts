import { prisma } from "@/lib/prisma";
import type { Prisma, ReferralCredit } from "@/generated/prisma/client";

/**
 * $20 credit to the referrer when the referred user completes their first
 * session. Matches the Loveable marketing copy on the /referrals page and
 * the founder-facing product spec. Tweakable here as a single source of
 * truth — do not hardcode anywhere else.
 */
export const REFERRAL_CREDIT_IN_CENTS = 2000;

type TxClient = Prisma.TransactionClient;
type Client = TxClient | typeof prisma;

/**
 * Called from sessions/transitions.ts::approveEnd inside the completion
 * transaction. No-ops if:
 *  - the referred user has no referredByUserId (wasn't referred)
 *  - the referrer was already credited for this referred user
 *    (ReferralCredit.referredUserId is @unique — race-safe)
 *  - the referred user has completed a session before this one
 *    (defensive — "first completion" semantics)
 */
export async function issueReferralCreditIfFirstCompletion(
  referredUserId: string,
  sessionId: string,
  tx: TxClient,
): Promise<ReferralCredit | null> {
  const user = await tx.user.findUnique({
    where: { id: referredUserId },
    select: { referredByUserId: true },
  });
  if (!user?.referredByUserId) return null;

  // "First completion" = this session is the ONLY completed one we've seen
  // so far. The caller runs inside the transaction that flips the current
  // session to COMPLETED, so the count should be exactly 1.
  const completedCount = await tx.session.count({
    where: { clientId: referredUserId, status: "COMPLETED" },
  });
  if (completedCount !== 1) return null;

  // Race-safe via ReferralCredit.referredUserId @unique — if two transitions
  // for the same user collide, the second INSERT hits the unique and we
  // skip cleanly.
  const existing = await tx.referralCredit.findUnique({
    where: { referredUserId },
    select: { id: true },
  });
  if (existing) return null;

  return tx.referralCredit.create({
    data: {
      referrerUserId: user.referredByUserId,
      referredUserId,
      creditAmountInCents: REFERRAL_CREDIT_IN_CENTS,
      sessionId,
    },
  });
}

/**
 * Returns the total unredeemed referral credit balance for a user, in cents.
 * Consumed by checkout to show the user their available credit before
 * Stripe Checkout redirect.
 */
export async function getUnredeemedCreditBalance(
  userId: string,
  client: Client = prisma,
): Promise<number> {
  const { _sum } = await client.referralCredit.aggregate({
    where: { referrerUserId: userId, redeemedAt: null },
    _sum: { creditAmountInCents: true },
  });
  return _sum.creditAmountInCents ?? 0;
}

/**
 * Atomically claim up to `maxCents` of unredeemed credit for a user and
 * return the claimed amount. Marks the consumed ReferralCredit rows as
 * redeemed so a later call can't double-spend. Call from within a Stripe
 * Checkout session builder: decrement the total by the returned amount,
 * stash the claim in metadata for the webhook to finalize.
 */
export async function claimCredit(
  userId: string,
  maxCents: number,
  tx: TxClient,
): Promise<{ claimedCents: number; claimedIds: string[] }> {
  if (maxCents <= 0) return { claimedCents: 0, claimedIds: [] };

  const candidates = await tx.referralCredit.findMany({
    where: { referrerUserId: userId, redeemedAt: null },
    orderBy: { earnedAt: "asc" },
  });

  const claimedIds: string[] = [];
  let claimedCents = 0;

  for (const credit of candidates) {
    if (claimedCents + credit.creditAmountInCents > maxCents) break;
    claimedIds.push(credit.id);
    claimedCents += credit.creditAmountInCents;
  }

  if (claimedIds.length > 0) {
    await tx.referralCredit.updateMany({
      where: { id: { in: claimedIds } },
      data: { redeemedAt: new Date() },
    });
  }

  // We never overfill: if the next credit would push us past maxCents we
  // stop. That keeps the caller's discount ≤ maxCents (the cart total),
  // which matches Stripe's expectation. Splitting a partial credit would
  // need a dedicated row and is out of scope — credits are uniform $20 today.
  return { claimedCents, claimedIds };
}
