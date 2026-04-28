import { prisma } from "@/lib/prisma";

export async function getSessionsByClient(userId: string) {
  return prisma.session.findMany({
    where: { clientId: userId, deletedAt: null },
    include: {
      stylist: {
        select: {
          firstName: true,
          lastName: true,
          avatarUrl: true,
          stylistProfile: { select: { id: true } },
        },
      },
      // Latest message preview powers the Loveable SessionCard's body line.
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { text: true, createdAt: true, kind: true },
      },
      // Any sent board the client hasn't rated yet flags the session as
      // "new_board" priority — left-accent bar + "Review Style Board" CTA.
      boards: {
        where: { sentAt: { not: null }, rating: null },
        orderBy: { sentAt: "desc" },
        take: 1,
        select: { id: true, type: true },
      },
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
