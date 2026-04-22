/**
 * Monthly 00:00 UTC on the 1st. Defensive full-scan recompute:
 *   (a) every User's loyalty tier + LoyaltyAccount row — catches any drift
 *       from the synchronous hook in sessions/transitions.ts::approveEnd.
 *   (b) every StylistProfile.averageRating — aggregates ratings from
 *       Session.rating + StylistReview.rating.
 *
 * We intentionally full-scan rather than diffing since this runs monthly
 * and a Wishi user base of O(1M) * a few ms each fits comfortably in the
 * scheduler budget.
 */
import { prisma } from "@/lib/prisma";
import { recomputeForUser } from "@/lib/loyalty/service";

interface RecalcSummary extends Record<string, unknown> {
  loyaltyUsersScanned: number;
  loyaltyTierChanges: number;
  stylistsScanned: number;
  stylistsRatingUpdated: number;
}

export async function runLoyaltyRecalc(): Promise<RecalcSummary> {
  let loyaltyTierChanges = 0;

  const clients = await prisma.user.findMany({
    where: { role: "CLIENT" },
    select: { id: true, loyaltyTier: true },
  });

  for (const client of clients) {
    const { tier } = await recomputeForUser(client.id);
    if (tier !== client.loyaltyTier) loyaltyTierChanges++;
  }

  const stylistProfiles = await prisma.stylistProfile.findMany({
    select: { id: true, userId: true, averageRating: true },
  });

  let stylistsRatingUpdated = 0;

  for (const profile of stylistProfiles) {
    const next = await computeStylistAverageRating(profile.id, profile.userId);
    if (next !== profile.averageRating) {
      await prisma.stylistProfile.update({
        where: { id: profile.id },
        data: { averageRating: next },
      });
      stylistsRatingUpdated++;
    }
  }

  return {
    loyaltyUsersScanned: clients.length,
    loyaltyTierChanges,
    stylistsScanned: stylistProfiles.length,
    stylistsRatingUpdated,
  };
}

/**
 * Average across every signal we have: explicit StylistReview rows and the
 * per-session rating captured at end-session. Returns null when there's no
 * signal yet (matches the default on a fresh StylistProfile).
 */
async function computeStylistAverageRating(
  stylistProfileId: string,
  stylistUserId: string,
): Promise<number | null> {
  const [reviewAgg, sessionAgg] = await Promise.all([
    prisma.stylistReview.aggregate({
      where: { stylistProfileId },
      _sum: { rating: true },
      _count: { rating: true },
    }),
    prisma.session.aggregate({
      where: { stylistId: stylistUserId, rating: { not: null } },
      _sum: { rating: true },
      _count: { rating: true },
    }),
  ]);

  const totalCount = (reviewAgg._count.rating ?? 0) + (sessionAgg._count.rating ?? 0);
  if (totalCount === 0) return null;

  const totalSum = (reviewAgg._sum.rating ?? 0) + (sessionAgg._sum.rating ?? 0);
  return totalSum / totalCount;
}
