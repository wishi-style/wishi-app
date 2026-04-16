import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const board = await prisma.board.findUnique({
    where: { id },
    include: {
      photos: { orderBy: { orderIndex: "asc" } },
      session: { select: { id: true, clientId: true, stylistId: true } },
    },
  });
  if (!board || board.type !== "MOODBOARD") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (
    !board.session ||
    (board.session.clientId !== user.id &&
      board.session.stylistId !== user.id &&
      user.role !== "ADMIN")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(board);
}
