import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { removeMoodboardPhoto } from "@/lib/boards/moodboard.service";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, photoId } = await params;
  const board = await prisma.board.findUnique({
    where: { id },
    include: { session: { select: { stylistId: true } } },
  });
  if (!board || board.type !== "MOODBOARD" || !board.session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (board.session.stylistId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (board.sentAt) {
    return NextResponse.json(
      { error: "Cannot edit a sent moodboard" },
      { status: 400 },
    );
  }
  const photo = await prisma.boardPhoto.findUnique({ where: { id: photoId } });
  if (!photo || photo.boardId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await removeMoodboardPhoto(photoId);
  return NextResponse.json({ ok: true });
}
