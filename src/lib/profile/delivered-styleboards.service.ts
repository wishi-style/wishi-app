import { prisma } from "@/lib/prisma";
import { resolveThumbnailsForBoards } from "@/lib/boards/board-thumbnails";

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
 *
 * Thumbnail resolution delegates to `resolveThumbnailsForBoards`, which
 * handles INVENTORY items via tastegraph, CLOSET/INSPIRATION/WEB items
 * directly, and falls back to `Board.coverUrl`. Without this, styleboards
 * composed entirely of INVENTORY items (the LookCreator common case)
 * yield `thumbnailUrl: null` because `BoardItem.webItemImageUrl` is null
 * for inventory rows.
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
      type: true,
      coverUrl: true,
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
        orderBy: { orderIndex: "asc" },
        take: 4,
        select: {
          source: true,
          inventoryProductId: true,
          webItemImageUrl: true,
          closetItem: { select: { url: true } },
          inspirationPhoto: { select: { url: true } },
        },
      },
    },
    orderBy: { sentAt: "desc" },
  });

  const thumbnailsByBoard = await resolveThumbnailsForBoards(
    boards.map((b) => ({
      id: b.id,
      type: b.type as "MOODBOARD" | "STYLEBOARD",
      coverUrl: b.coverUrl,
      photos: b.photos,
      items: b.items.map((i) => ({
        source: i.source,
        inventoryProductId: i.inventoryProductId,
        webItemImageUrl: i.webItemImageUrl,
        closetItem: i.closetItem,
        inspirationPhoto: i.inspirationPhoto,
      })),
    })),
    1,
  );

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
      thumbnailUrl: thumbnailsByBoard.get(b.id)?.[0] ?? null,
    }));
}
