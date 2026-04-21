import { prisma } from "@/lib/prisma";

export type AdminMetrics = {
  activeSessions: number;
  mtdRevenueCents: number;
  signups7d: number;
  signups30d: number;
  newSubscriptions30d: number;
  trialsOutstanding: number;
};

function startOfMonth(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function daysAgo(days: number, now = new Date()) {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

export async function loadAdminMetrics(): Promise<AdminMetrics> {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const sevenDaysAgo = daysAgo(7, now);
  const thirtyDaysAgo = daysAgo(30, now);

  const [
    activeSessions,
    mtdRevenueAgg,
    signups7d,
    signups30d,
    newSubscriptions30d,
    trialsOutstanding,
  ] = await Promise.all([
    prisma.session.count({
      where: {
        status: { in: ["ACTIVE", "PENDING_END", "PENDING_END_APPROVAL"] },
        deletedAt: null,
      },
    }),
    prisma.payment.aggregate({
      where: { status: "SUCCEEDED", createdAt: { gte: monthStart } },
      _sum: { amountInCents: true },
    }),
    prisma.user.count({
      where: { createdAt: { gte: sevenDaysAgo }, deletedAt: null },
    }),
    prisma.user.count({
      where: { createdAt: { gte: thirtyDaysAgo }, deletedAt: null },
    }),
    prisma.subscription.count({
      where: { createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.subscription.count({ where: { status: "TRIALING" } }),
  ]);

  return {
    activeSessions,
    mtdRevenueCents: mtdRevenueAgg._sum.amountInCents ?? 0,
    signups7d,
    signups30d,
    newSubscriptions30d,
    trialsOutstanding,
  };
}
