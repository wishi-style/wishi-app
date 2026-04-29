import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getServerAuth } from "@/lib/auth/server-auth";
import {
  createInspirationPhoto,
  listInspirationPhotos,
} from "@/lib/boards/inspiration.service";
import { getInspirationPhotoPresignedUrl } from "@/lib/s3";

export const dynamic = "force-dynamic";

/**
 * GET: any authenticated user can list inspiration (stylists need it for board
 * builders). Admin-only write ops live on POST/DELETE.
 */
export async function GET(req: Request) {
  const { userId } = await getServerAuth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const photos = await listInspirationPhotos({
    category: url.searchParams.get("category") ?? undefined,
    search: url.searchParams.get("q") ?? undefined,
    take: Number(url.searchParams.get("take")) || undefined,
    skip: Number(url.searchParams.get("skip")) || undefined,
  });
  return NextResponse.json({ photos });
}

/**
 * POST: admin creates a row after a direct-to-S3 upload. Body: { s3Key, url,
 * title?, category?, tags? }. Supports ?presign=1&filename=...&contentType=...
 * to issue a presigned PUT URL instead.
 */
export async function POST(req: Request) {
  await requireAdmin();
  const url = new URL(req.url);
  if (url.searchParams.get("presign") === "1") {
    const filename = url.searchParams.get("filename");
    const contentType = url.searchParams.get("contentType");
    if (!filename || !contentType) {
      return NextResponse.json(
        { error: "filename and contentType required for presign" },
        { status: 400 },
      );
    }
    const presigned = await getInspirationPhotoPresignedUrl(filename, contentType);
    return NextResponse.json(presigned);
  }

  const body = await req.json();
  if (!body.s3Key || !body.url) {
    return NextResponse.json(
      { error: "s3Key and url required" },
      { status: 400 },
    );
  }
  const photo = await createInspirationPhoto(body);
  return NextResponse.json(photo, { status: 201 });
}
