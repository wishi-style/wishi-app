import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClosetItem, listClosetItems } from "@/lib/boards/closet.service";
import { getClosetItemPresignedUrl } from "@/lib/s3";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const items = await listClosetItems({
    userId: user.id,
    category: url.searchParams.get("category") ?? undefined,
    designer: url.searchParams.get("designer") ?? undefined,
    color: url.searchParams.get("color") ?? undefined,
    season: url.searchParams.get("season") ?? undefined,
  });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  if (url.searchParams.get("presign") === "1") {
    const filename = url.searchParams.get("filename");
    const contentType = url.searchParams.get("contentType");
    if (!filename || !contentType) {
      return NextResponse.json(
        { error: "filename and contentType required" },
        { status: 400 },
      );
    }
    const presigned = await getClosetItemPresignedUrl(user.id, filename, contentType);
    return NextResponse.json(presigned);
  }

  const body = await req.json();
  if (!body.s3Key || !body.url) {
    return NextResponse.json(
      { error: "s3Key and url required" },
      { status: 400 },
    );
  }
  const item = await createClosetItem({
    userId: user.id,
    s3Key: body.s3Key,
    url: body.url,
    name: body.name,
    designer: body.designer,
    season: body.season,
    category: body.category,
    colors: Array.isArray(body.colors) ? body.colors : undefined,
    size: body.size,
    material: body.material,
  });
  return NextResponse.json(item, { status: 201 });
}
