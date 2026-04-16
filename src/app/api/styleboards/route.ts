import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createStyleboard } from "@/lib/boards/styleboard.service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "STYLIST") {
    return NextResponse.json({ error: "Stylist only" }, { status: 403 });
  }
  const body = await req.json();
  const sessionId = body?.sessionId as string | undefined;
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { stylistId: true },
  });
  if (!session || session.stylistId !== user.id) {
    return NextResponse.json({ error: "Not the session's stylist" }, { status: 403 });
  }
  const board = await createStyleboard({
    sessionId,
    stylistUserId: user.id,
    parentBoardId: body?.parentBoardId ?? undefined,
  });
  return NextResponse.json(board, { status: 201 });
}
