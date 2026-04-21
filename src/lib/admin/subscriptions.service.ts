import { prisma } from "@/lib/prisma";
import type {
  PlanType,
  SubscriptionFrequency,
  SubscriptionStatus,
} from "@/generated/prisma/client";

export type AdminSubscriptionRow = {
  id: string;
  userName: string;
  userEmail: string;
  userId: string;
  planType: PlanType;
  status: SubscriptionStatus;
  frequency: SubscriptionFrequency;
  currentPeriodEnd: Date | null;
  pausedUntil: Date | null;
  cancelRequestedAt: Date | null;
  createdAt: Date;
};

export async function listAdminSubscriptions(filter?: {
  status?: SubscriptionStatus;
  take?: number;
}): Promise<AdminSubscriptionRow[]> {
  const rows = await prisma.subscription.findMany({
    where: { status: filter?.status },
    orderBy: { createdAt: "desc" },
    take: filter?.take ?? 200,
    select: {
      id: true,
      planType: true,
      status: true,
      frequency: true,
      currentPeriodEnd: true,
      pausedUntil: true,
      cancelRequestedAt: true,
      createdAt: true,
      userId: true,
      user: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: `${r.user.firstName} ${r.user.lastName}`,
    userEmail: r.user.email,
    planType: r.planType,
    status: r.status,
    frequency: r.frequency,
    currentPeriodEnd: r.currentPeriodEnd,
    pausedUntil: r.pausedUntil,
    cancelRequestedAt: r.cancelRequestedAt,
    createdAt: r.createdAt,
  }));
}

export async function getAdminSubscriptionDetail(subscriptionId: string) {
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });
  if (!sub) return null;
  const payments = await prisma.payment.findMany({
    where: { userId: sub.userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return { subscription: sub, payments };
}
