import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { removeStyleboardItem } from "@/lib/boards/styleboard.service";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, itemId } = await params;
  const board = await prisma.board.findUnique({
    where: { id },
    include: { session: { select: { stylistId: true } } },
  });
  if (!board || board.type !== "STYLEBOARD" || !board.session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (board.session.stylistId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (board.sentAt) {
    return NextResponse.json(
      { error: "Cannot modify a sent board" },
      { status: 400 },
    );
  }
  try {
    await removeStyleboardItem(id, itemId);
  } catch {
    return NextResponse.json({ error: "Item not found on board" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
