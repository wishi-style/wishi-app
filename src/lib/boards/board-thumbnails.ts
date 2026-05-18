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
import type { BoardThumbnailItem } from "@/components/boards/board-thumbnail";

interface ThumbnailItem {
  source: string;
  inventoryProductId: string | null;
  webItemImageUrl: string | null;
  processedImageUrl?: string | null;
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
          processedImageUrl: true,
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
    processedImageUrl: i.processedImageUrl,
    closetItemUrl: i.closetItem?.url ?? null,
    inspirationPhotoUrl: i.inspirationPhoto?.url ?? null,
  }));

  const resolved = await Promise.all(
    items.map(async (it) => {
      // When the stylist persisted a background-removed cutout, prefer it
      // over the source lookup so the hero/thumbnails stay correct even
      // when the inventory service is down.
      if (it.processedImageUrl) return it.processedImageUrl;
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
    processedImageUrl?: string | null;
    closetItem?: { url: string | null } | null;
    inspirationPhoto?: { url: string | null } | null;
  }[];
}

export interface ResolvedBoardCanvas {
  type: "MOODBOARD" | "STYLEBOARD";
  canvasMode: string | null;
  /** Moodboard photo URLs in orderIndex order. Empty for styleboards. */
  photoUrls: string[];
  /** Styleboard items with resolved image URLs + canvas coordinates. Empty for moodboards. */
  items: BoardThumbnailItem[];
}

export interface BoardWithCanvasRows {
  id: string;
  type: "MOODBOARD" | "STYLEBOARD";
  canvasMode: string | null;
  coverUrl: string | null;
  photos: { url: string }[];
  items: {
    id: string;
    source: string;
    inventoryProductId: string | null;
    webItemImageUrl: string | null;
    closetItem?: { url: string | null } | null;
    inspirationPhoto?: { url: string | null } | null;
    x: number | null;
    y: number | null;
    width: number | null;
    rotation: number | null;
    zIndex: number | null;
    flipH: boolean;
    flipV: boolean;
    cropTop: number | null;
    cropRight: number | null;
    cropBottom: number | null;
    cropLeft: number | null;
    processedImageUrl: string | null;
  }[];
}

/**
 * Batch resolver that returns enough data for BoardThumbnail to render every
 * surface (profile page, share link, feed) with the same square composition
 * the stylist designed. INVENTORY items resolve via tastegraph in parallel;
 * getProduct's 5-minute cache dedupes repeat boards in the same render.
 */
export async function resolveCanvasForBoards(
  boards: BoardWithCanvasRows[],
): Promise<Map<string, ResolvedBoardCanvas>> {
  const map = new Map<string, ResolvedBoardCanvas>();
  await Promise.all(
    boards.map(async (b) => {
      if (b.type === "MOODBOARD") {
        map.set(b.id, {
          type: "MOODBOARD",
          canvasMode: b.canvasMode,
          photoUrls: b.photos.map((p) => p.url).filter((u): u is string => Boolean(u)),
          items: [],
        });
        return;
      }
      const resolvedItems: BoardThumbnailItem[] = await Promise.all(
        b.items.map(async (it): Promise<BoardThumbnailItem> => {
          const imageUrl = await (async (): Promise<string | null> => {
            // Saved cutout shortcuts the source lookup. Both for performance
            // (no inventory round-trip) and for resilience — when tastegraph
            // is unavailable, items with a saved cutout still render.
            if (it.processedImageUrl) return it.processedImageUrl;
            switch (it.source) {
              case "INVENTORY":
                if (!it.inventoryProductId) return null;
                return (
                  (await getProduct(it.inventoryProductId))?.primary_image_url ??
                  null
                );
              case "CLOSET":
                return it.closetItem?.url ?? null;
              case "INSPIRATION_PHOTO":
                return it.inspirationPhoto?.url ?? null;
              case "WEB_ADDED":
                return it.webItemImageUrl ?? null;
              default:
                return null;
            }
          })();
          const crop =
            it.cropTop != null ||
            it.cropRight != null ||
            it.cropBottom != null ||
            it.cropLeft != null
              ? {
                  top: it.cropTop ?? 0,
                  right: it.cropRight ?? 0,
                  bottom: it.cropBottom ?? 0,
                  left: it.cropLeft ?? 0,
                }
              : null;
          return {
            id: it.id,
            imageUrl,
            processedImageUrl: it.processedImageUrl,
            x: it.x,
            y: it.y,
            width: it.width,
            rotation: it.rotation,
            zIndex: it.zIndex,
            flipH: it.flipH,
            flipV: it.flipV,
            crop,
          };
        }),
      );
      map.set(b.id, {
        type: "STYLEBOARD",
        canvasMode: b.canvasMode,
        photoUrls: [],
        items: resolvedItems,
      });
    }),
  );
  return map;
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
          // Saved cutout wins — keeps the hero/share fallback rendering
          // accurate when tastegraph is degraded.
          if (it.processedImageUrl) return it.processedImageUrl;
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
