import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  favoriteItem,
  listFavoriteItems,
  unfavoriteItem,
} from "@/lib/boards/favorite.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items = await listFavoriteItems(user.id);
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  try {
    const fav = await favoriteItem({ userId: user.id, ...body });
    return NextResponse.json(fav, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const inventoryProductId = url.searchParams.get("inventoryProductId") ?? undefined;
  const webUrl = url.searchParams.get("webUrl") ?? undefined;
  if (!inventoryProductId && !webUrl) {
    return NextResponse.json(
      { error: "inventoryProductId or webUrl required" },
      { status: 400 },
    );
  }
  const removed = await unfavoriteItem({
    userId: user.id,
    inventoryProductId,
    webUrl,
  });
  return NextResponse.json({ removed });
}
