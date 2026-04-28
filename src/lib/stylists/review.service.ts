import { prisma } from "@/lib/prisma";
import { DomainError, NotFoundError } from "@/lib/errors/domain-error";
import type { Prisma, StylistReview } from "@/generated/prisma/client";

export interface ReviewListItem {
  id: string;
  source: "REVIEW" | "SESSION";
  rating: number;
  reviewText: string;
  createdAt: Date;
  author: {
    firstName: string;
    lastNameInitial: string;
  };
}

export interface ListReviewsOptions {
  limit?: number;
  offset?: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
// Defensive cap on raw rows pulled per source. Aggregating both sources +
// sorting + slicing in memory is fine for the stylist review volumes we
// expect (low hundreds at most); this cap bounds the worst case so a single
// outlier stylist with thousands of historical reviews can't OOM the page.
// If/when a stylist approaches this cap we'll switch to cursor pagination.
const MAX_AGGREGATE_ROWS_PER_SOURCE = 500;

/**
 * List reviews for a stylist, aggregating explicit `StylistReview` rows with
 * `Session.reviewText` written at end-session time. Each user has at most one
 * explicit review (DB unique); when both an explicit review and a session
 * rating exist for the same user, the explicit one wins so the row count
 * reflects what the user actually sees.
 */
export async function listStylistReviews(
  stylistProfileId: string,
  options: ListReviewsOptions = {},
): Promise<{ reviews: ReviewListItem[]; total: number }> {
  const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const offset = options.offset ?? 0;

  // Resolve stylist's userId so we can find their sessions.
  const profile = await prisma.stylistProfile.findUnique({
    where: { id: stylistProfileId },
    select: { userId: true },
  });
  if (!profile) throw new NotFoundError("Stylist not found");

  // Pull both sources in parallel, capped per source.
  const [explicitReviews, sessionReviews] = await Promise.all([
    prisma.stylistReview.findMany({
      where: { stylistProfileId },
      include: {
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_AGGREGATE_ROWS_PER_SOURCE,
    }),
    prisma.session.findMany({
      where: {
        stylistId: profile.userId,
        status: "COMPLETED",
        rating: { not: null },
        reviewText: { not: null },
      },
      select: {
        id: true,
        rating: true,
        reviewText: true,
        ratedAt: true,
        completedAt: true,
        createdAt: true,
        client: { select: { firstName: true, lastName: true, id: true } },
      },
      orderBy: { ratedAt: "desc" },
      take: MAX_AGGREGATE_ROWS_PER_SOURCE,
    }),
  ]);

  // De-dup: if a user has both an explicit review and a session rating,
  // prefer the explicit one (user-authored after the fact).
  const reviewedUserIds = new Set(explicitReviews.map((r) => r.userId));

  const explicitItems: ReviewListItem[] = explicitReviews.map((r) => ({
    id: r.id,
    source: "REVIEW",
    rating: r.rating,
    reviewText: r.reviewText,
    createdAt: r.createdAt,
    author: {
      firstName: r.user?.firstName ?? "Anonymous",
      lastNameInitial: r.user?.lastName?.charAt(0) ?? "",
    },
  }));

  const sessionItems: ReviewListItem[] = sessionReviews
    .filter((s) => s.client && !reviewedUserIds.has(s.client.id))
    .map((s) => ({
      id: `session_${s.id}`,
      source: "SESSION",
      rating: s.rating!,
      reviewText: s.reviewText!,
      createdAt: s.ratedAt ?? s.completedAt ?? s.createdAt,
      author: {
        firstName: s.client?.firstName ?? "Anonymous",
        lastNameInitial: s.client?.lastName?.charAt(0) ?? "",
      },
    }));

  const all = [...explicitItems, ...sessionItems].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

  // total mirrors the de-duped list so the "Reviews (N)" chip in the UI
  // never disagrees with the entries the user can actually page through.
  return { reviews: all.slice(offset, offset + limit), total: all.length };
}

export interface FeaturedReviewItem {
  id: string;
  source: "REVIEW" | "SESSION";
  rating: number;
  reviewText: string;
  createdAt: Date;
  author: {
    firstName: string;
    lastNameInitial: string;
  };
  stylist: {
    profileId: string;
    firstName: string;
    avatarUrl: string | null;
  };
}

/**
 * Featured reviews across every stylist, for the public /reviews page.
 * Pulls both explicit `StylistReview` rows and `Session.reviewText`,
 * filters to rating >= minRating (default 4), and orders by rating
 * desc then createdAt desc. De-duplicates per (clientId, stylistId)
 * so a user who both rated their session and later wrote an explicit
 * review shows up only once.
 */
export async function listFeaturedReviews(options: {
  limit?: number;
  minRating?: number;
} = {}): Promise<FeaturedReviewItem[]> {
  const limit = Math.min(options.limit ?? 12, 50);
  const minRating = options.minRating ?? 4;

  const [explicitReviews, sessionReviews] = await Promise.all([
    prisma.stylistReview.findMany({
      where: { rating: { gte: minRating } },
      include: {
        user: { select: { firstName: true, lastName: true } },
        stylistProfile: {
          select: {
            id: true,
            user: { select: { firstName: true, avatarUrl: true } },
          },
        },
      },
      orderBy: [{ rating: "desc" }, { createdAt: "desc" }],
      take: limit * 3,
    }),
    prisma.session.findMany({
      where: {
        status: "COMPLETED",
        rating: { gte: minRating },
        reviewText: { not: null },
        stylist: { stylistProfile: { isNot: null } },
      },
      select: {
        id: true,
        rating: true,
        reviewText: true,
        ratedAt: true,
        completedAt: true,
        createdAt: true,
        clientId: true,
        stylistId: true,
        client: { select: { firstName: true, lastName: true } },
        stylist: {
          select: {
            firstName: true,
            avatarUrl: true,
            stylistProfile: { select: { id: true } },
          },
        },
      },
      orderBy: [{ rating: "desc" }, { ratedAt: "desc" }],
      take: limit * 3,
    }),
  ]);

  const reviewedKeys = new Set(
    explicitReviews.map((r) => `${r.userId}:${r.stylistProfileId}`),
  );

  const explicitItems: FeaturedReviewItem[] = explicitReviews.map((r) => ({
    id: r.id,
    source: "REVIEW",
    rating: r.rating,
    reviewText: r.reviewText,
    createdAt: r.createdAt,
    author: {
      firstName: r.user.firstName,
      lastNameInitial: r.user.lastName.charAt(0),
    },
    stylist: {
      profileId: r.stylistProfile.id,
      firstName: r.stylistProfile.user.firstName,
      avatarUrl: r.stylistProfile.user.avatarUrl ?? null,
    },
  }));

  const sessionItems: FeaturedReviewItem[] = sessionReviews.flatMap((s) => {
    const stylistUser = s.stylist;
    const profileId = stylistUser?.stylistProfile?.id;
    if (!stylistUser || !profileId) return [];
    if (reviewedKeys.has(`${s.clientId}:${profileId}`)) return [];
    return [
      {
        id: `session_${s.id}`,
        source: "SESSION" as const,
        rating: s.rating!,
        reviewText: s.reviewText!,
        createdAt: s.ratedAt ?? s.completedAt ?? s.createdAt,
        author: {
          firstName: s.client.firstName,
          lastNameInitial: s.client.lastName.charAt(0),
        },
        stylist: {
          profileId,
          firstName: stylistUser.firstName,
          avatarUrl: stylistUser.avatarUrl ?? null,
        },
      },
    ];
  });

  return [...explicitItems, ...sessionItems]
    .sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .slice(0, limit);
}

export interface CreateReviewInput {
  userId: string;
  stylistProfileId: string;
  rating: number;
  reviewText: string;
  sessionId?: string;
}

export const REVIEW_TEXT_MIN = 5;
export const REVIEW_TEXT_MAX = 5000;

/**
 * Validate rating + text shape. Pure function so it can be unit-tested
 * without a database. Returns the trimmed text on success; throws
 * DomainError otherwise.
 */
export function validateReviewInput(input: {
  rating: number;
  reviewText: string;
}): string {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new DomainError("Rating must be an integer 1–5");
  }
  const text = input.reviewText.trim();
  if (text.length < REVIEW_TEXT_MIN) {
    throw new DomainError("Review text too short");
  }
  if (text.length > REVIEW_TEXT_MAX) {
    throw new DomainError("Review text too long");
  }
  return text;
}

/**
 * Write an explicit review. Caller must have ≥1 COMPLETED session with this
 * stylist; that gate is enforced here so workers/scripts can't bypass the
 * route check. Recomputes `StylistProfile.averageRating` in the same
 * transaction so the cosmetic rating chip on stylist cards is accurate.
 */
export async function createStylistReview(
  input: CreateReviewInput,
): Promise<StylistReview> {
  const text = validateReviewInput({
    rating: input.rating,
    reviewText: input.reviewText,
  });

  const profile = await prisma.stylistProfile.findUnique({
    where: { id: input.stylistProfileId },
    select: { userId: true },
  });
  if (!profile) throw new NotFoundError("Stylist not found");

  const completed = await prisma.session.count({
    where: {
      clientId: input.userId,
      stylistId: profile.userId,
      status: "COMPLETED",
    },
  });
  if (completed === 0) {
    // Caller (route) is expected to gate via canUserReviewStylist and return
    // 403 first; this is a defense-in-depth check for direct service callers.
    throw new DomainError(
      "You can only review stylists you have completed a session with",
    );
  }

  return prisma.$transaction(async (tx) => {
    const review = await tx.stylistReview.upsert({
      where: {
        userId_stylistProfileId: {
          userId: input.userId,
          stylistProfileId: input.stylistProfileId,
        },
      },
      create: {
        userId: input.userId,
        stylistProfileId: input.stylistProfileId,
        sessionId: input.sessionId ?? null,
        rating: input.rating,
        reviewText: text,
      },
      update: {
        rating: input.rating,
        reviewText: text,
        sessionId: input.sessionId ?? null,
      },
    });

    await recomputeAverageRating(input.stylistProfileId, tx);

    return review;
  });
}

/**
 * Recompute `StylistProfile.averageRating` from BOTH explicit reviews and
 * session ratings (de-duped per user — explicit wins). Defensive worker
 * also calls this monthly so drift can't accumulate.
 */
export async function recomputeAverageRating(
  stylistProfileId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<number | null> {
  const profile = await tx.stylistProfile.findUnique({
    where: { id: stylistProfileId },
    select: { userId: true },
  });
  if (!profile) return null;

  const [explicit, sessions] = await Promise.all([
    tx.stylistReview.findMany({
      where: { stylistProfileId },
      select: { userId: true, rating: true },
    }),
    tx.session.findMany({
      where: {
        stylistId: profile.userId,
        status: "COMPLETED",
        rating: { not: null },
      },
      select: { clientId: true, rating: true },
    }),
  ]);

  const ratingsByUser = new Map<string, number>();
  for (const s of sessions) {
    if (s.rating != null) ratingsByUser.set(s.clientId, s.rating);
  }
  for (const r of explicit) {
    ratingsByUser.set(r.userId, r.rating); // explicit review overrides session rating
  }

  const ratings = [...ratingsByUser.values()];
  if (ratings.length === 0) {
    await tx.stylistProfile.update({
      where: { id: stylistProfileId },
      data: { averageRating: null },
    });
    return null;
  }

  const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  const rounded = Math.round(avg * 10) / 10;
  await tx.stylistProfile.update({
    where: { id: stylistProfileId },
    data: { averageRating: rounded },
  });
  return rounded;
}

/**
 * Has this user completed at least one session with this stylist? Used by
 * the UI to decide whether to render the Write a Review button.
 */
export async function canUserReviewStylist(
  userId: string,
  stylistProfileId: string,
): Promise<boolean> {
  const profile = await prisma.stylistProfile.findUnique({
    where: { id: stylistProfileId },
    select: { userId: true },
  });
  if (!profile) return false;
  const count = await prisma.session.count({
    where: {
      clientId: userId,
      stylistId: profile.userId,
      status: "COMPLETED",
    },
  });
  return count > 0;
}
