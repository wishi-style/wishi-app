import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  canUserReviewStylist,
  createStylistReview,
  listStylistReviews,
} from "@/lib/stylists/review.service";
import { isDomainError } from "@/lib/errors/domain-error";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: Props) {
  const { id: stylistProfileId } = await params;
  const url = new URL(req.url);
  const limit = url.searchParams.get("limit");
  const offset = url.searchParams.get("offset");

  try {
    const result = await listStylistReviews(stylistProfileId, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (isDomainError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(req: Request, { params }: Props) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: stylistProfileId } = await params;
  const body = (await req.json()) as {
    rating?: number;
    reviewText?: string;
    sessionId?: string;
  };

  if (typeof body.rating !== "number" || typeof body.reviewText !== "string") {
    return NextResponse.json(
      { error: "rating (number) and reviewText (string) required" },
      { status: 400 },
    );
  }

  // Eligibility gate up-front so the response status reflects the policy
  // (403 forbidden) rather than a generic validation 400 from the service.
  const eligible = await canUserReviewStylist(user.id, stylistProfileId);
  if (!eligible) {
    return NextResponse.json(
      { error: "You can only review stylists you have completed a session with" },
      { status: 403 },
    );
  }

  try {
    const review = await createStylistReview({
      userId: user.id,
      stylistProfileId,
      rating: body.rating,
      reviewText: body.reviewText,
      sessionId: body.sessionId,
    });
    return NextResponse.json(review, { status: 201 });
  } catch (err) {
    if (isDomainError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
