import { prisma } from "@/lib/prisma";
import { getProduct } from "@/lib/inventory/inventory-client";
import type {
  WorkspaceBoard,
  WorkspaceItem,
  WorkspaceCartItem,
  WorkspaceProgress,
} from "@/components/session/workspace";

/**
 * Collects the data the session workspace needs:
 *  - boards list (moodboards + styleboards) with the first photo / item
 *    image as a thumbnail
 *  - curated pieces = union of all styleboard items + single-item chat
 *    messages, sorted newest first
 *  - session-scoped cart (hydrated from the inventory service)
 *  - progress card data (plan tier, styleboards sent vs plan.boardCount,
 *    revisions sent) for the StylingRoom sidebar
 */
export async function getWorkspaceData(sessionId: string, userId?: string) {
  const [boards, singleItemMessages, session, cartItems] = await Promise.all([
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
    prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        styleboardsSent: true,
        revisionsSent: true,
        itemsSent: true,
        plan: {
          select: {
            type: true,
            boardCount: true,
            additionalLookPriceCents: true,
          },
        },
      },
    }),
    userId
      ? prisma.cartItem.findMany({
          where: { userId, sessionId },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const boardSummaries: WorkspaceBoard[] = boards.map((b: (typeof boards)[number]) => {
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

  const cart: WorkspaceCartItem[] = await Promise.all(
    cartItems.map(async (row: (typeof cartItems)[number]) => {
      const product = await getProduct(row.inventoryProductId);
      return {
        cartItemId: row.id,
        inventoryProductId: row.inventoryProductId,
        quantity: row.quantity,
        name: product?.canonical_name ?? row.inventoryProductId,
        brand: product?.brand_name ?? "",
        imageUrl: product?.primary_image_url ?? null,
        priceInCents: Math.round((product?.min_price ?? 0) * 100),
      };
    }),
  );

  const progress: WorkspaceProgress = {
    planType: session?.plan?.type ?? "MAJOR",
    boardCount: session?.plan?.boardCount ?? 4,
    styleboardsSent: session?.styleboardsSent ?? 0,
    revisionsSent: session?.revisionsSent ?? 0,
    itemsSent: session?.itemsSent ?? 0,
    additionalLookPriceCents: session?.plan?.additionalLookPriceCents ?? 2000,
  };

  return { boards: boardSummaries, curated, cart, progress };
}
