import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { scrapeFromUrl } from "@/lib/closet/scrape-from-url";
import {
  assertPublicHttpUrl,
  UnsafeUrlError,
} from "@/lib/closet/url-safety";

export const dynamic = "force-dynamic";

interface FromUrlBody {
  url?: string;
  category?: string;
}

/**
 * POST /api/closet/from-url — inline Open-Graph scrape. Fetches the retailer
 * page, parses meta tags, downloads the primary image to S3, and writes a
 * ClosetItem. Returns 202 with `partial: true` if we could only get some
 * metadata — the user can edit in the UI.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as FromUrlBody;
  if (!body.url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  try {
    await assertPublicHttpUrl(body.url);
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const { closetItem, partial } = await scrapeFromUrl({
    userId: user.id,
    url: body.url,
    category: body.category,
  });

  return NextResponse.json(
    { item: closetItem, partial },
    { status: partial ? 202 : 201 },
  );
}
