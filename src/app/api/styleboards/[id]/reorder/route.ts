import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reorderStyleboardItems } from "@/lib/boards/styleboard.service";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
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
    return NextResponse.json({ error: "Board already sent" }, { status: 400 });
  }
  const body = (await req.json()) as { order?: string[] };
  if (!Array.isArray(body?.order)) {
    return NextResponse.json({ error: "order[] required" }, { status: 400 });
  }
  await reorderStyleboardItems(id, body.order);
  return NextResponse.json({ ok: true });
}
