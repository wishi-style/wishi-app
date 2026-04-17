import { prisma } from "@/lib/prisma";
import type { SessionStatus } from "@/generated/prisma/client";

export type AdminSessionRow = {
  id: string;
  status: SessionStatus;
  planType: string;
  clientName: string;
  clientEmail: string;
  stylistName: string | null;
  createdAt: Date;
  amountPaidInCents: number;
};

export async function listAdminSessions(filter?: {
  status?: SessionStatus;
  take?: number;
}): Promise<AdminSessionRow[]> {
  const rows = await prisma.session.findMany({
    where: { deletedAt: null, status: filter?.status },
    orderBy: { createdAt: "desc" },
    take: filter?.take ?? 200,
    select: {
      id: true,
      status: true,
      planType: true,
      createdAt: true,
      amountPaidInCents: true,
      client: { select: { firstName: true, lastName: true, email: true } },
      stylist: { select: { firstName: true, lastName: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    planType: r.planType,
    clientName: `${r.client.firstName} ${r.client.lastName}`,
    clientEmail: r.client.email,
    stylistName: r.stylist
      ? `${r.stylist.firstName} ${r.stylist.lastName}`
      : null,
    createdAt: r.createdAt,
    amountPaidInCents: r.amountPaidInCents,
  }));
}

export async function getAdminSessionDetail(sessionId: string) {
  return prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      client: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      stylist: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      matchHistory: { orderBy: { matchedAt: "desc" } },
      pendingActions: { orderBy: { createdAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
}

export async function listEligibleStylistsForReassign(
  excludeStylistId?: string | null,
) {
  const stylists = await prisma.stylistProfile.findMany({
    where: {
      matchEligible: true,
      isAvailable: true,
      user: {
        deletedAt: null,
        id: excludeStylistId ? { not: excludeStylistId } : undefined,
      },
    },
    select: {
      userId: true,
      stylistType: true,
      user: { select: { firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return stylists.map((s) => ({
    userId: s.userId,
    stylistType: s.stylistType,
    name: `${s.user.firstName} ${s.user.lastName}`,
    email: s.user.email,
  }));
}
