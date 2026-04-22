import { NextResponse } from "next/server";
import { listFeedBoards, type FeedGender } from "@/lib/feed/feed.service";

export const dynamic = "force-dynamic";

const VALID_GENDERS: readonly FeedGender[] = ["WOMEN", "MEN"] as const;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const genderParam = url.searchParams.get("gender") ?? "WOMEN";
  const gender = (VALID_GENDERS as readonly string[]).includes(genderParam)
    ? (genderParam as FeedGender)
    : "WOMEN";
  const cursor = url.searchParams.get("cursor");
  const limit = Number(url.searchParams.get("limit") ?? 24);

  const page = await listFeedBoards({
    gender,
    cursor: cursor || undefined,
    limit: Number.isFinite(limit) ? limit : 24,
  });

  return NextResponse.json(page);
}
