import { prisma } from "@/lib/prisma";
import type {
  WorkspaceBoard,
  WorkspaceItem,
} from "@/components/session/workspace";

/**
 * Collects the data the session workspace needs:
 *  - boards list (moodboards + styleboards) with the first photo / item
 *    image as a thumbnail
 *  - curated pieces = union of all styleboard items + single-item chat
 *    messages, sorted newest first
 */
export async function getWorkspaceData(sessionId: string) {
  const [boards, singleItemMessages] = await Promise.all([
    prisma.board.findMany({
      where: { sessionId },
      include: {
        photos: { orderBy: { orderIndex: "asc" }, take: 1 },
        items: {
          orderBy: { orderIndex: "asc" },
          include: {
            closetItem: { select: { url: true, name: true, designer: true } },
            inspirationPhoto: { select: { url: true, title: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.message.findMany({
      where: { sessionId, kind: "SINGLE_ITEM" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const boardSummaries: WorkspaceBoard[] = boards.map((b) => {
    let thumbnailUrl: string | null = null;
    if (b.type === "MOODBOARD") {
      thumbnailUrl = b.photos[0]?.url ?? null;
    } else {
      const first = b.items[0];
      if (first) {
        if (first.source === "CLOSET") thumbnailUrl = first.closetItem?.url ?? null;
        else if (first.source === "INSPIRATION_PHOTO")
          thumbnailUrl = first.inspirationPhoto?.url ?? null;
        else if (first.source === "WEB_ADDED") thumbnailUrl = first.webItemImageUrl ?? null;
      }
    }
    return {
      id: b.id,
      type: b.type,
      isRevision: b.isRevision,
      sentAt: b.sentAt?.toISOString() ?? null,
      rating: b.rating,
      thumbnailUrl,
    };
  });

  const curated: WorkspaceItem[] = [];
  for (const b of boards) {
    if (b.type !== "STYLEBOARD" || !b.sentAt) continue;
    for (const it of b.items) {
      let imageUrl: string | null = null;
      let label: string | null = null;
      let brand: string | null = null;
      if (it.source === "CLOSET") {
        imageUrl = it.closetItem?.url ?? null;
        label = it.closetItem?.name ?? null;
        brand = it.closetItem?.designer ?? null;
      } else if (it.source === "INSPIRATION_PHOTO") {
        imageUrl = it.inspirationPhoto?.url ?? null;
        label = it.inspirationPhoto?.title ?? null;
      } else if (it.source === "WEB_ADDED") {
        imageUrl = it.webItemImageUrl;
        label = it.webItemTitle ?? it.webItemUrl;
        brand = it.webItemBrand;
      } else if (it.source === "INVENTORY") {
        label = it.inventoryProductId;
      }
      curated.push({
        id: it.id,
        source: it.source,
        orderIndex: it.orderIndex,
        boardId: it.boardId,
        boardSentAt: b.sentAt.toISOString(),
        imageUrl,
        label,
        brand,
      });
    }
  }
  for (const m of singleItemMessages) {
    curated.push({
      id: `msg-${m.id}`,
      source: "SINGLE_ITEM",
      orderIndex: 0,
      boardId: "",
      boardSentAt: m.createdAt.toISOString(),
      imageUrl: null,
      label: m.singleItemInventoryProductId ?? m.singleItemWebUrl,
      brand: null,
    });
  }
  curated.sort((a, b) => {
    const ta = a.boardSentAt ? new Date(a.boardSentAt).getTime() : 0;
    const tb = b.boardSentAt ? new Date(b.boardSentAt).getTime() : 0;
    return tb - ta;
  });

  return { boards: boardSummaries, curated };
}
