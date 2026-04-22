import { prisma } from "@/lib/prisma";
import { DomainError, NotFoundError } from "@/lib/errors/domain-error";
import type { StylistReview } from "@/generated/prisma/client";

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

/**
 * List reviews for a stylist, aggregating explicit `StylistReview` rows with
 * `Session.reviewText` written at end-session time. Returns one entry per
 * source row so the UI can paginate uniformly. Each user can have at most one
 * `StylistReview` per stylist (DB unique), so end-session reviews and explicit
 * reviews live as separate entries by design.
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

  // Query both sources in parallel, then merge sorted by createdAt desc.
  const [explicitReviews, sessionReviews, explicitCount, sessionCount] =
    await Promise.all([
      prisma.stylistReview.findMany({
        where: { stylistProfileId },
        include: {
          user: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
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
      }),
      prisma.stylistReview.count({ where: { stylistProfileId } }),
      prisma.session.count({
        where: {
          stylistId: profile.userId,
          status: "COMPLETED",
          rating: { not: null },
          reviewText: { not: null },
        },
      }),
    ]);

  // Avoid double-counting: if a user has both an explicit review and a
  // session review, prefer the explicit one (it's user-authored after the
  // fact, the session one is the rating chip).
  const reviewedUserIds = new Set(explicitReviews.map((r) => r.userId));

  const explicitItems: ReviewListItem[] = explicitReviews.map((r) => ({
    id: r.id,
    source: "REVIEW",
    rating: r.rating,
    reviewText: r.reviewText,
    createdAt: r.createdAt,
    author: {
      firstName: r.user.firstName,
      lastNameInitial: r.user.lastName.charAt(0),
    },
  }));

  const sessionItems: ReviewListItem[] = sessionReviews
    .filter((s) => !reviewedUserIds.has(s.client.id))
    .map((s) => ({
      id: `session_${s.id}`,
      source: "SESSION",
      rating: s.rating!,
      reviewText: s.reviewText!,
      createdAt: s.ratedAt ?? s.completedAt ?? s.createdAt,
      author: {
        firstName: s.client.firstName,
        lastNameInitial: s.client.lastName.charAt(0),
      },
    }));

  const all = [...explicitItems, ...sessionItems].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

  // Total reflects raw row counts, not the de-duped UI list, so the UI knows
  // when more pages exist server-side.
  const total = explicitCount + sessionCount;

  return { reviews: all.slice(offset, offset + limit), total };
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

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Recompute `StylistProfile.averageRating` from BOTH explicit reviews and
 * session ratings (de-duped per user — explicit wins). Defensive worker
 * also calls this monthly so drift can't accumulate.
 */
export async function recomputeAverageRating(
  stylistProfileId: string,
  tx: PrismaTx | typeof prisma = prisma,
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
