import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  patchStyleboardItem,
  removeStyleboardItem,
} from "@/lib/boards/styleboard.service";

export const dynamic = "force-dynamic";

async function authorize(boardId: string, userId: string) {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: { session: { select: { stylistId: true } } },
  });
  if (!board || board.type !== "STYLEBOARD" || !board.session) {
    return { error: "Not found" as const, status: 404 };
  }
  if (board.session.stylistId !== userId) {
    return { error: "Forbidden" as const, status: 403 };
  }
  if (board.sentAt) {
    return { error: "Cannot modify a sent board" as const, status: 400 };
  }
  return { board };
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, itemId } = await params;
  const auth = await authorize(id, user.id);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    await removeStyleboardItem(id, itemId);
  } catch {
    return NextResponse.json({ error: "Item not found on board" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, itemId } = await params;
  const auth = await authorize(id, user.id);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json().catch(() => ({}))) as {
    x?: number;
    y?: number;
    zIndex?: number;
  };
  try {
    const item = await patchStyleboardItem(id, itemId, body);
    return NextResponse.json(item);
  } catch {
    return NextResponse.json({ error: "Item not found on board" }, { status: 404 });
  }
}
