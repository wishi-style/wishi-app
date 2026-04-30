import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  addMoodboardPhoto,
  MoodboardPhotoCapError,
} from "@/lib/boards/moodboard.service";
import { getBoardPhotoPresignedUrl } from "@/lib/s3";

export const dynamic = "force-dynamic";

async function authorize(boardId: string, userId: string) {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: { session: { select: { stylistId: true } } },
  });
  if (!board || board.type !== "MOODBOARD" || !board.session) return null;
  if (board.session.stylistId !== userId) return null;
  if (board.sentAt) return null; // can't edit a sent board
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

  const url = new URL(req.url);
  if (url.searchParams.get("presign") === "1") {
    const filename = url.searchParams.get("filename");
    const contentType = url.searchParams.get("contentType");
    if (!filename || !contentType) {
      return NextResponse.json({ error: "filename and contentType required" }, { status: 400 });
    }
    const presigned = await getBoardPhotoPresignedUrl(user.id, filename, contentType);
    return NextResponse.json(presigned);
  }

  const body = await req.json();
  if (!body.s3Key || !body.url) {
    return NextResponse.json({ error: "s3Key and url required" }, { status: 400 });
  }
  try {
    const photo = await addMoodboardPhoto(id, {
      s3Key: body.s3Key,
      url: body.url,
      inspirationPhotoId: body.inspirationPhotoId ?? null,
    });
    return NextResponse.json(photo, { status: 201 });
  } catch (err) {
    if (err instanceof MoodboardPhotoCapError) {
      return NextResponse.json(
        { error: err.message, code: err.code, cap: err.cap },
        { status: 400 },
      );
    }
    throw err;
  }
}
