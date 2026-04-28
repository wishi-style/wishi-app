import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendStyleboard } from "@/lib/boards/styleboard.service";

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
  let input: { title?: string; description?: string; tags?: string[] } = {};
  if (req.headers.get("content-type")?.includes("application/json")) {
    input = (await req.json().catch(() => ({}))) as typeof input;
  }
  try {
    const sent = await sendStyleboard(id, input);
    return NextResponse.json(sent);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to send" },
      { status: 400 },
    );
  }
}
