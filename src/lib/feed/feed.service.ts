import { prisma } from "@/lib/prisma";

export type FeedGender = "WOMEN" | "MEN";
type Gender = "MALE" | "FEMALE" | "NON_BINARY" | "PREFER_NOT_TO_SAY";

export type FeedProduct = {
  id: string;
  brand: string | null;
  name: string | null;
  priceInCents: number | null;
  imageUrl: string;
  url: string | null;
};

export type FeedBoardItem = {
  id: string;
  imageUrl: string | null;
  processedImageUrl: string | null;
  x: number | null;
  y: number | null;
  width: number | null;
  rotation: number | null;
  zIndex: number | null;
  flipH: boolean;
  flipV: boolean;
  crop: { top: number; right: number; bottom: number; left: number } | null;
};

export type FeedBoard = {
  id: string;
  type: "MOODBOARD" | "STYLEBOARD";
  canvasMode: string | null;
  title: string | null;
  profileStyle: string | null;
  coverImageUrl: string | null;
  /** Photo URLs in orderIndex order — drives the BoardThumbnail render for
   *  moodboards (and falls back to a single-image render in legacy clients). */
  photoUrls: string[];
  /** Resolved styleboard items with canvas positions, used by BoardThumbnail
   *  to mirror the LookCreator composition on the feed card. */
  items: FeedBoardItem[];
  createdAt: Date;
  isFavorited: boolean;
  stylist: {
    profileId: string;
    name: string;
    avatarUrl: string | null;
  };
  /**
   * Up to 12 web-sourced products from the board, used to populate Loveable's
   * right-column product grid on each FeedCard. Inventory-sourced items are
   * not enriched here — that requires a fan-out to the inventory service and
   * is tracked under Phase 11 polish.
   */
  products: FeedProduct[];
};

export type FeedPage = {
  boards: FeedBoard[];
  nextCursor: string | null;
};

function mapGender(gender: FeedGender): Gender {
  return gender === "MEN" ? "MALE" : "FEMALE";
}

/**
 * Public stylist-looks feed — cursor-paginated over profile styleboards
 * across every `matchEligible` stylist, filtered by which genders each
 * stylist is available to style (StylistProfile.genderPreference).
 *
 * Ranking at launch is recency-only per R5 (recommendation signals are
 * post-launch work).
 */
export async function listFeedBoards(params: {
  gender: FeedGender;
  cursor?: string | null;
  limit?: number;
  userId?: string | null;
}): Promise<FeedPage> {
  const limit = Math.min(Math.max(params.limit ?? 24, 1), 48);
  const gender = mapGender(params.gender);

  const boards = await prisma.board.findMany({
    where: {
      stylistProfile: {
        matchEligible: true,
        genderPreference: { has: gender },
        user: { deletedAt: null },
      },
      OR: [
        // Profile styleboards (sessionless boards explicitly featured on the
        // stylist's public profile) — the original feed surface.
        {
          type: "STYLEBOARD",
          isFeaturedOnProfile: true,
          sessionId: null,
        },
        // Shared-on-feed boards from sessions — either type, opt-in by stylist
        // at send time. Requires sentAt to be set so drafts never leak.
        {
          shareOnFeed: true,
          sentAt: { not: null },
        },
      ],
    },
    include: {
      photos: {
        orderBy: { orderIndex: "asc" },
        take: 24,
        select: { id: true, url: true },
      },
      items: {
        orderBy: { orderIndex: "asc" },
        take: 24,
        select: {
          id: true,
          source: true,
          orderIndex: true,
          x: true,
          y: true,
          width: true,
          rotation: true,
          zIndex: true,
          flipH: true,
          flipV: true,
          cropTop: true,
          cropRight: true,
          cropBottom: true,
          cropLeft: true,
          processedImageUrl: true,
          // Web items power the FeedCard product grid AND supply image URLs
          // for the BoardThumbnail canvas render when source = WEB_ADDED.
          webItemBrand: true,
          webItemTitle: true,
          webItemPriceInCents: true,
          webItemImageUrl: true,
          webItemUrl: true,
          // Other sources contribute image URLs via their joined relations.
          closetItem: { select: { url: true } },
          inspirationPhoto: { select: { url: true } },
        },
      },
      stylistProfile: {
        select: {
          id: true,
          user: {
            select: { firstName: true, lastName: true, avatarUrl: true },
          },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(params.cursor
      ? { cursor: { id: params.cursor }, skip: 1 }
      : {}),
  });

  const hasMore = boards.length > limit;
  const page = hasMore ? boards.slice(0, limit) : boards;

  type Row = (typeof boards)[number];
  const visible = page.filter((b: Row) => b.stylistProfile !== null);

  const favoritedIds = new Set<string>();
  if (params.userId && visible.length > 0) {
    const favorites = await prisma.favoriteBoard.findMany({
      where: {
        userId: params.userId,
        boardId: { in: visible.map((b: Row) => b.id) },
      },
      select: { boardId: true },
    });
    for (const f of favorites) favoritedIds.add(f.boardId);
  }

  return {
    boards: visible.map((b: Row) => {
      const sp = b.stylistProfile!;
      const firstName = sp.user.firstName ?? "";
      const lastName = sp.user.lastName ?? "";
      const products: FeedProduct[] = b.items
        .filter((it) => it.webItemImageUrl !== null)
        .map((it) => ({
          id: it.id,
          brand: it.webItemBrand,
          name: it.webItemTitle,
          priceInCents: it.webItemPriceInCents,
          imageUrl: it.webItemImageUrl as string,
          url: it.webItemUrl,
        }));
      const items: FeedBoardItem[] = b.items.map((it) => ({
        id: it.id,
        imageUrl:
          it.source === "WEB_ADDED"
            ? it.webItemImageUrl
            : it.source === "CLOSET"
              ? it.closetItem?.url ?? null
              : it.source === "INSPIRATION_PHOTO"
                ? it.inspirationPhoto?.url ?? null
                : null,
        processedImageUrl: it.processedImageUrl,
        x: it.x,
        y: it.y,
        width: it.width,
        rotation: it.rotation,
        zIndex: it.zIndex,
        flipH: it.flipH,
        flipV: it.flipV,
        crop:
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
            : null,
      }));
      return {
        id: b.id,
        type: b.type,
        canvasMode: b.canvasMode,
        title: b.title,
        profileStyle: b.profileStyle,
        coverImageUrl: b.photos[0]?.url ?? null,
        photoUrls: b.photos
          .map((p) => p.url)
          .filter((u): u is string => Boolean(u)),
        items,
        createdAt: b.createdAt,
        isFavorited: favoritedIds.has(b.id),
        stylist: {
          profileId: sp.id,
          name: `${firstName} ${lastName}`.trim(),
          avatarUrl: sp.user.avatarUrl,
        },
        products,
      };
    }),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}
