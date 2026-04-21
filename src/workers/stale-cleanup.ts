/**
 * Daily 03:00 UTC. Removes abandoned anonymous state so the DB doesn't grow
 * forever. Phase 5 adds the anonymous MatchQuizResult sweep; future phases
 * extend this worker with more cleanup rules.
 */
import { prisma } from "@/lib/prisma";

interface CleanupSummary extends Record<string, unknown> {
  anonymousQuizResultsDeleted: number;
}

export async function runStaleCleanup(): Promise<CleanupSummary> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const { count } = await prisma.matchQuizResult.deleteMany({
    where: {
      userId: null,
      completedAt: { lt: thirtyDaysAgo },
    },
  });

  return { anonymousQuizResultsDeleted: count };
}
