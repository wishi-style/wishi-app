import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  addStyleboardItem,
  type AddItemInput,
} from "@/lib/boards/styleboard.service";

export const dynamic = "force-dynamic";

async function authorize(boardId: string, userId: string) {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: { session: { select: { stylistId: true } } },
  });
  if (!board || board.type !== "STYLEBOARD" || !board.session) return null;
  if (board.session.stylistId !== userId) return null;
  if (board.sentAt) return null;
  return board;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const board = await authorize(id, user.id);
  if (!board) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json()) as AddItemInput;
  try {
    const item = await addStyleboardItem(id, body);
    return NextResponse.json(item, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Add item failed" },
      { status: 400 },
    );
  }
}
