import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Returns the stylist's past sent moodboards as a flat list — used by the
// LookCreator's "Previous boards → Mood boards" sub-tab. The cover image
// is the first BoardPhoto on each board.

interface PreviousMoodboardItem {
  id: string;
  boardId: string;
  boardTitle: string | null;
  imageUrl: string | null;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "STYLIST" && !user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 40), 100);

  const stylistProfile = await prisma.stylistProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!stylistProfile) return NextResponse.json({ items: [] });

  const boards = await prisma.board.findMany({
    where: {
      stylistProfileId: stylistProfile.id,
      type: "MOODBOARD",
      sentAt: { not: null },
      ...(clientId
        ? {
            session: { clientId },
          }
        : {}),
    },
    orderBy: { sentAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      photos: {
        orderBy: { orderIndex: "asc" },
        take: 1,
        select: { url: true },
      },
    },
  });

  const items: PreviousMoodboardItem[] = boards.map((b) => ({
    id: b.id,
    boardId: b.id,
    boardTitle: b.title,
    imageUrl: b.photos[0]?.url ?? null,
  }));

  return NextResponse.json({ items });
}
