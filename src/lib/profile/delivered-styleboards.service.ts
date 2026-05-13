import { prisma } from "@/lib/prisma";

export interface DeliveredStyleboard {
  boardId: string;
  sessionId: string;
  title: string | null;
  description: string | null;
  sentAt: Date;
  isRevision: boolean;
  stylistFirstName: string;
  stylistLastName: string;
  thumbnailUrl: string | null;
}

/**
 * Every styleboard a stylist has sent the client across all their sessions,
 * including revisions. Ordered by sentAt desc.
 *
 * Backs the /profile Looks tab. Drops the favorite-only gate the previous
 * implementation used — chats are closed once a session ends, so the
 * profile is the only place the user can revisit looks. Surfacing every
 * delivered styleboard ensures the record is complete.
 */
export async function listDeliveredStyleboardsForClient(
  clientId: string,
): Promise<DeliveredStyleboard[]> {
  const boards = await prisma.board.findMany({
    where: {
      type: "STYLEBOARD",
      sentAt: { not: null },
      session: { clientId },
    },
    select: {
      id: true,
      sessionId: true,
      title: true,
      description: true,
      sentAt: true,
      isRevision: true,
      session: {
        select: {
          stylist: {
            select: { firstName: true, lastName: true },
          },
        },
      },
      photos: {
        orderBy: { orderIndex: "asc" },
        take: 1,
        select: { url: true },
      },
      items: {
        where: { webItemImageUrl: { not: null } },
        orderBy: { orderIndex: "asc" },
        take: 1,
        select: { webItemImageUrl: true },
      },
    },
    orderBy: { sentAt: "desc" },
  });

  return boards
    .filter((b) => b.sentAt !== null && b.sessionId !== null)
    .map((b) => ({
      boardId: b.id,
      sessionId: b.sessionId!,
      title: b.title,
      description: b.description,
      sentAt: b.sentAt!,
      isRevision: b.isRevision,
      stylistFirstName: b.session?.stylist?.firstName ?? "Stylist",
      stylistLastName: b.session?.stylist?.lastName ?? "",
      thumbnailUrl:
        b.photos[0]?.url ?? b.items[0]?.webItemImageUrl ?? null,
    }));
}
