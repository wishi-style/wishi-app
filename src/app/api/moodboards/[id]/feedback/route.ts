import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateMoodboard, type MoodboardRating } from "@/lib/boards/moodboard.service";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const rating = body?.rating as MoodboardRating | undefined;
  if (rating !== "LOVE" && rating !== "NOT_MY_STYLE") {
    return NextResponse.json(
      { error: "rating must be LOVE or NOT_MY_STYLE" },
      { status: 400 },
    );
  }

  const board = await prisma.board.findUnique({
    where: { id },
    include: { session: { select: { clientId: true } } },
  });
  if (!board || board.type !== "MOODBOARD" || !board.session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (board.session.clientId !== user.id) {
    return NextResponse.json({ error: "Only the client can rate" }, { status: 403 });
  }
  const updated = await rateMoodboard(id, rating, body?.feedbackText ?? undefined);
  return NextResponse.json(updated);
}
