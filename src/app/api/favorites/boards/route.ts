import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  favoriteBoard,
  listFavoriteBoards,
  unfavoriteBoard,
} from "@/lib/boards/favorite.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const boards = await listFavoriteBoards(user.id);
  return NextResponse.json({ boards });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body?.boardId) {
    return NextResponse.json({ error: "boardId required" }, { status: 400 });
  }
  const fav = await favoriteBoard(user.id, body.boardId as string);
  return NextResponse.json(fav, { status: 201 });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const boardId = url.searchParams.get("boardId");
  if (!boardId) {
    return NextResponse.json({ error: "boardId required" }, { status: 400 });
  }
  await unfavoriteBoard(user.id, boardId);
  return NextResponse.json({ ok: true });
}
