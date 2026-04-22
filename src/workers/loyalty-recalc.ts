/**
 * Monthly 00:00 UTC on the 1st. Defensive full-scan recompute:
 *   (a) every User's loyalty tier + LoyaltyAccount row — catches any drift
 *       from the synchronous hook in sessions/transitions.ts::approveEnd.
 *   (b) every StylistProfile.averageRating — aggregates ratings from
 *       Session.rating + StylistReview.rating.
 *
 * Built with set-based aggregation (one groupBy per dataset) so the worker
 * scales with the number of *active* users, not the total user table. User
 * writes happen in bounded-concurrency batches so we don't open 10k Prisma
 * connections against the RDS Proxy.
 */
import { prisma } from "@/lib/prisma";
import { tierForCompletedCount } from "@/lib/loyalty/service";

const WRITE_CONCURRENCY = 8;

interface RecalcSummary extends Record<string, unknown> {
  loyaltyUsersScanned: number;
  loyaltyTierChanges: number;
  stylistsScanned: number;
  stylistsRatingUpdated: number;
}

export async function runLoyaltyRecalc(): Promise<RecalcSummary> {
  const loyaltyStats = await recomputeLoyalty();
  const stylistStats = await recomputeStylistRatings();
  return {
    loyaltyUsersScanned: loyaltyStats.scanned,
    loyaltyTierChanges: loyaltyStats.tierChanges,
    stylistsScanned: stylistStats.scanned,
    stylistsRatingUpdated: stylistStats.updated,
  };
}

async function recomputeLoyalty(): Promise<{ scanned: number; tierChanges: number }> {
  // One query: {clientId → completed session count} for every client with
  // at least one completed session. Clients with 0 completions already have
  // the correct BRONZE default; no write needed.
  const completed = await prisma.session.groupBy({
    by: ["clientId"],
    where: { status: "COMPLETED" },
    _count: { _all: true },
  });

  let tierChanges = 0;

  await forEachChunk(completed, WRITE_CONCURRENCY, async (row) => {
    const count = row._count._all;
    const tier = tierForCompletedCount(count);

    // Upsert returns whether we created a new row OR whether the tier
    // changed. We check the prior LoyaltyAccount/User.loyaltyTier first so
    // we only update when values differ — cheaper than blind upserts since
    // Postgres still writes WAL on unchanged columns.
    const prior = await prisma.loyaltyAccount.findUnique({
      where: { userId: row.clientId },
      select: { tier: true, lifetimeBookingCount: true },
    });

    if (!prior || prior.tier !== tier || prior.lifetimeBookingCount !== count) {
      await prisma.loyaltyAccount.upsert({
        where: { userId: row.clientId },
        create: { userId: row.clientId, tier, lifetimeBookingCount: count },
        update: { tier, lifetimeBookingCount: count },
      });
      await prisma.user.update({
        where: { id: row.clientId },
        data: { loyaltyTier: tier },
      });
      if (prior?.tier !== tier) tierChanges++;
    }
  });

  return { scanned: completed.length, tierChanges };
}

async function recomputeStylistRatings(): Promise<{
  scanned: number;
  updated: number;
}> {
  // Two groupBys + one findMany of profiles with existing ratings, then
  // in-memory join. `StylistReview` aggregates by stylistProfileId, but
  // `Session.rating` aggregates by stylistId (User.id). We look up the
  // {stylistUserId → stylistProfileId} mapping once to join.
  const [reviewAgg, sessionAgg, profiles] = await Promise.all([
    prisma.stylistReview.groupBy({
      by: ["stylistProfileId"],
      _sum: { rating: true },
      _count: { rating: true },
    }),
    prisma.session.groupBy({
      by: ["stylistId"],
      where: { stylistId: { not: null }, rating: { not: null } },
      _sum: { rating: true },
      _count: { rating: true },
    }),
    prisma.stylistProfile.findMany({
      select: { id: true, userId: true, averageRating: true },
    }),
  ]);

  // {profileId → {sum, count}}
  const combined = new Map<string, { sum: number; count: number }>();
  for (const r of reviewAgg) {
    combined.set(r.stylistProfileId, {
      sum: r._sum.rating ?? 0,
      count: r._count.rating ?? 0,
    });
  }

  const profileByUserId = new Map(profiles.map((p) => [p.userId, p.id]));
  for (const s of sessionAgg) {
    if (!s.stylistId) continue;
    const profileId = profileByUserId.get(s.stylistId);
    if (!profileId) continue; // orphan stylistId — skip defensively
    const prev = combined.get(profileId) ?? { sum: 0, count: 0 };
    combined.set(profileId, {
      sum: prev.sum + (s._sum.rating ?? 0),
      count: prev.count + (s._count.rating ?? 0),
    });
  }

  let updated = 0;

  await forEachChunk(profiles, WRITE_CONCURRENCY, async (profile) => {
    const agg = combined.get(profile.id);
    const next = agg && agg.count > 0 ? agg.sum / agg.count : null;
    if (next !== profile.averageRating) {
      await prisma.stylistProfile.update({
        where: { id: profile.id },
        data: { averageRating: next },
      });
      updated++;
    }
  });

  return { scanned: profiles.length, updated };
}

async function forEachChunk<T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    await Promise.all(chunk.map(fn));
  }
}
