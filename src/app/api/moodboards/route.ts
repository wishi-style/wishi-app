import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createMoodboard } from "@/lib/boards/moodboard.service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "STYLIST") {
    return NextResponse.json({ error: "Stylist only" }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  if (status !== "draft") {
    return NextResponse.json({ error: "Only ?status=draft is supported" }, { status: 400 });
  }

  const stylist = await prisma.stylistProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!stylist) return NextResponse.json({ drafts: [] });

  const boards = await prisma.board.findMany({
    where: {
      type: "MOODBOARD",
      sentAt: null,
      stylistProfileId: stylist.id,
      sessionId: { not: null },
      // Loveable parity: only surface drafts that actually have content.
      // The page-load auto-create at moodboards/new/page.tsx leaves empty
      // Board rows behind on every visit; filtering here keeps the
      // dashboard rail pixel-faithful to Loveable while the deferred-
      // creation refactor lands on its own commit.
      photos: { some: {} },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      sessionId: true,
      updatedAt: true,
      session: {
        select: {
          client: { select: { firstName: true, lastName: true } },
        },
      },
      photos: {
        orderBy: { orderIndex: "asc" },
        take: 1,
        select: { url: true },
      },
      _count: { select: { photos: true } },
    },
  });

  const drafts = boards.map((b) => ({
    id: b.id,
    sessionId: b.sessionId,
    clientName:
      [b.session?.client.firstName, b.session?.client.lastName]
        .filter(Boolean)
        .join(" ") || "Client",
    images: b.photos.map((p) => p.url),
    photoCount: b._count.photos,
    updatedAt: b.updatedAt.toISOString(),
  }));

  return NextResponse.json({ drafts });
}

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
  const board = await createMoodboard(sessionId, user.id);
  return NextResponse.json(board, { status: 201 });
}
