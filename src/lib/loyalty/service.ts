import { prisma } from "@/lib/prisma";
import type { LoyaltyTier, Prisma } from "@/generated/prisma/client";

export const TIER_THRESHOLDS: Record<LoyaltyTier, { min: number; max: number }> = {
  BRONZE: { min: 0, max: 2 },
  GOLD: { min: 3, max: 7 },
  PLATINUM: { min: 8, max: Number.POSITIVE_INFINITY },
};

export function tierForCompletedCount(completed: number): LoyaltyTier {
  if (completed >= 8) return "PLATINUM";
  if (completed >= 3) return "GOLD";
  return "BRONZE";
}

type TxClient = Prisma.TransactionClient;
type Client = TxClient | typeof prisma;

export interface RecomputeOpts {
  tx?: TxClient;
}

/**
 * Recount COMPLETED sessions for the user and update both the LoyaltyAccount
 * row (canonical) and User.loyaltyTier (denormalized cache). Safe to run
 * inside or outside a transaction — falls back to `prisma` when no tx given.
 */
export async function recomputeForUser(
  userId: string,
  opts: RecomputeOpts = {},
): Promise<{ tier: LoyaltyTier; lifetimeBookingCount: number }> {
  const client: Client = opts.tx ?? prisma;

  const lifetimeBookingCount = await client.session.count({
    where: { clientId: userId, status: "COMPLETED" },
  });
  const tier = tierForCompletedCount(lifetimeBookingCount);

  await client.loyaltyAccount.upsert({
    where: { userId },
    create: { userId, lifetimeBookingCount, tier },
    update: { lifetimeBookingCount, tier },
  });

  await client.user.update({
    where: { id: userId },
    data: { loyaltyTier: tier },
  });

  return { tier, lifetimeBookingCount };
}

/**
 * Convenience helper for the session-completion hook. Always called from
 * inside the approveEnd transaction so the loyalty update is atomic with
 * the session status flip.
 */
export async function onSessionCompleted(
  clientUserId: string,
  tx: TxClient,
): Promise<void> {
  await recomputeForUser(clientUserId, { tx });
}
