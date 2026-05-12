// Resolves the visible thumbnails for a board card. Moodboards render
// from BoardPhoto rows; styleboards render from BoardItem.webItemImageUrl
// (closet/inspiration/web items) and from getProduct() resolving INVENTORY
// items via tastegraph. Returns up to `limit` URLs in order.
//
// This is shared by the public stylist profile (/stylists/[id]) and the
// stylist's profile-boards manager (/stylist/profile/boards) so both
// surfaces show the same multi-image collage.

import { prisma } from "@/lib/prisma";
import { getProduct } from "@/lib/inventory/inventory-client";

interface ThumbnailItem {
  source: string;
  inventoryProductId: string | null;
  webItemImageUrl: string | null;
  closetItemUrl?: string | null;
  inspirationPhotoUrl?: string | null;
}

export async function resolveBoardThumbnails(
  boardId: string,
  limit = 4,
): Promise<string[]> {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: {
      type: true,
      coverUrl: true,
      photos: {
        orderBy: { orderIndex: "asc" },
        take: limit,
        select: { url: true },
      },
      items: {
        orderBy: { orderIndex: "asc" },
        take: limit * 2,
        select: {
          source: true,
          inventoryProductId: true,
          webItemImageUrl: true,
          closetItem: { select: { url: true } },
          inspirationPhoto: { select: { url: true } },
        },
      },
    },
  });
  if (!board) return [];

  if (board.type === "MOODBOARD") {
    return board.photos.map((p) => p.url).filter(Boolean).slice(0, limit);
  }

  const items: ThumbnailItem[] = board.items.map((i) => ({
    source: i.source,
    inventoryProductId: i.inventoryProductId,
    webItemImageUrl: i.webItemImageUrl,
    closetItemUrl: i.closetItem?.url ?? null,
    inspirationPhotoUrl: i.inspirationPhoto?.url ?? null,
  }));

  const resolved = await Promise.all(
    items.map(async (it) => {
      switch (it.source) {
        case "INVENTORY":
          if (!it.inventoryProductId) return null;
          return (await getProduct(it.inventoryProductId))?.primary_image_url ?? null;
        case "CLOSET":
          return it.closetItemUrl ?? null;
        case "INSPIRATION_PHOTO":
          return it.inspirationPhotoUrl ?? null;
        case "WEB_ADDED":
          return it.webItemImageUrl ?? null;
        default:
          return null;
      }
    }),
  );

  const urls = resolved.filter((u): u is string => Boolean(u)).slice(0, limit);
  if (urls.length > 0) return urls;
  return board.coverUrl ? [board.coverUrl] : [];
}

export interface BoardWithThumbnailRows {
  id: string;
  type: "MOODBOARD" | "STYLEBOARD";
  coverUrl: string | null;
  photos: { url: string }[];
  items: {
    source: string;
    inventoryProductId: string | null;
    webItemImageUrl: string | null;
    closetItem?: { url: string | null } | null;
    inspirationPhoto?: { url: string | null } | null;
  }[];
}

/**
 * Batch variant used by surfaces that already loaded the board rows
 * (e.g. /stylists/[id]/page.tsx). Resolves INVENTORY thumbnails in
 * parallel across all boards — getProduct() has its own 5-minute cache,
 * so repeat boards in the same render dedupe automatically.
 */
export async function resolveThumbnailsForBoards(
  boards: BoardWithThumbnailRows[],
  limit = 4,
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  await Promise.all(
    boards.map(async (b) => {
      if (b.type === "MOODBOARD") {
        map.set(b.id, b.photos.map((p) => p.url).filter(Boolean).slice(0, limit));
        return;
      }
      const resolved = await Promise.all(
        b.items.map(async (it) => {
          switch (it.source) {
            case "INVENTORY":
              if (!it.inventoryProductId) return null;
              return (await getProduct(it.inventoryProductId))?.primary_image_url ?? null;
            case "CLOSET":
              return it.closetItem?.url ?? null;
            case "INSPIRATION_PHOTO":
              return it.inspirationPhoto?.url ?? null;
            case "WEB_ADDED":
              return it.webItemImageUrl ?? null;
            default:
              return null;
          }
        }),
      );
      const urls = resolved.filter((u): u is string => Boolean(u)).slice(0, limit);
      map.set(b.id, urls.length > 0 ? urls : b.coverUrl ? [b.coverUrl] : []);
    }),
  );
  return map;
}
