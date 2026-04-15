import { prisma } from "@/lib/prisma";

export async function getSessionsByClient(userId: string) {
  return prisma.session.findMany({
    where: { clientId: userId, deletedAt: null },
    include: {
      stylist: { select: { firstName: true, lastName: true, avatarUrl: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getSessionById(sessionId: string) {
  return prisma.session.findFirst({
    where: { id: sessionId, deletedAt: null },
    include: {
      client: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      stylist: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
    },
  });
}

export async function hasActiveSessionWithStylist(
  clientId: string,
  stylistProfileId: string
) {
  const stylist = await prisma.stylistProfile.findUnique({
    where: { id: stylistProfileId },
    select: { userId: true },
  });
  if (!stylist) return false;

  const existing = await prisma.session.findFirst({
    where: {
      clientId,
      stylistId: stylist.userId,
      status: { in: ["BOOKED", "ACTIVE", "PENDING_END", "PENDING_END_APPROVAL"] },
      deletedAt: null,
    },
  });

  return !!existing;
}
