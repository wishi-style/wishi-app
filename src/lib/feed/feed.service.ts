import { prisma } from "@/lib/prisma";

export type FeedGender = "WOMEN" | "MEN";
type Gender = "MALE" | "FEMALE" | "NON_BINARY" | "PREFER_NOT_TO_SAY";

export type FeedBoard = {
  id: string;
  title: string | null;
  profileStyle: string | null;
  coverImageUrl: string | null;
  createdAt: Date;
  isFavorited: boolean;
  stylist: {
    profileId: string;
    name: string;
    avatarUrl: string | null;
  };
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
      type: "STYLEBOARD",
      isFeaturedOnProfile: true,
      sessionId: null,
      stylistProfile: {
        matchEligible: true,
        genderPreference: { has: gender },
        user: { deletedAt: null },
      },
    },
    include: {
      photos: {
        orderBy: { orderIndex: "asc" },
        take: 1,
        select: { url: true },
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
      return {
        id: b.id,
        title: b.title,
        profileStyle: b.profileStyle,
        coverImageUrl: b.photos[0]?.url ?? null,
        createdAt: b.createdAt,
        isFavorited: favoritedIds.has(b.id),
        stylist: {
          profileId: sp.id,
          name: `${firstName} ${lastName}`.trim(),
          avatarUrl: sp.user.avatarUrl,
        },
      };
    }),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}
