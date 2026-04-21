// Stylist profile boards. Same polymorphic Board model as session moodboards,
// but with sessionId=null + stylistProfileId + isFeaturedOnProfile + profileStyle.
// The polymorphic CHECK constraint (phase 4) allows this — the profile-board
// rows skip the session path entirely.

import { prisma } from "@/lib/prisma";
import { DomainError, NotFoundError } from "@/lib/errors/domain-error";
import type { Board, BoardPhoto } from "@/generated/prisma/client";

export const MIN_BOARDS_PER_STYLE = 3;
export const MAX_BOARDS_PER_STYLE = 10;

export async function createProfileBoard(input: {
  stylistUserId: string;
  profileStyle: string;
}): Promise<Board> {
  const stylist = await prisma.stylistProfile.findUniqueOrThrow({
    where: { userId: input.stylistUserId },
    select: { id: true },
  });

  const existing = await prisma.board.count({
    where: {
      stylistProfileId: stylist.id,
      sessionId: null,
      isFeaturedOnProfile: true,
      profileStyle: input.profileStyle,
    },
  });
  if (existing >= MAX_BOARDS_PER_STYLE) {
    throw new DomainError(
      `Max ${MAX_BOARDS_PER_STYLE} profile boards per style — unfeature an existing one first.`,
      409,
    );
  }

  return prisma.board.create({
    data: {
      type: "MOODBOARD",
      sessionId: null,
      stylistProfileId: stylist.id,
      isFeaturedOnProfile: true,
      profileStyle: input.profileStyle,
    },
  });
}

export async function listProfileBoards(
  stylistUserId: string,
  profileStyle?: string | null
) {
  const stylist = await prisma.stylistProfile.findUniqueOrThrow({
    where: { userId: stylistUserId },
    select: { id: true },
  });
  return prisma.board.findMany({
    where: {
      stylistProfileId: stylist.id,
      sessionId: null,
      ...(profileStyle ? { profileStyle } : {}),
    },
    include: {
      photos: { orderBy: { orderIndex: "asc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function unfeatureProfileBoard(
  stylistUserId: string,
  boardId: string
): Promise<void> {
  const stylist = await prisma.stylistProfile.findUniqueOrThrow({
    where: { userId: stylistUserId },
    select: { id: true },
  });
  const result = await prisma.board.updateMany({
    where: {
      id: boardId,
      stylistProfileId: stylist.id,
      sessionId: null,
    },
    data: { isFeaturedOnProfile: false },
  });
  if (result.count === 0) throw new NotFoundError("Profile board not found");
}

export async function addProfileBoardPhoto(
  stylistUserId: string,
  boardId: string,
  input: { s3Key: string; url: string; inspirationPhotoId?: string | null }
): Promise<BoardPhoto> {
  const stylist = await prisma.stylistProfile.findUniqueOrThrow({
    where: { userId: stylistUserId },
    select: { id: true },
  });
  const board = await prisma.board.findFirst({
    where: {
      id: boardId,
      stylistProfileId: stylist.id,
      sessionId: null,
    },
    select: { id: true },
  });
  if (!board) throw new NotFoundError("Profile board not found");

  const count = await prisma.boardPhoto.count({ where: { boardId } });
  return prisma.boardPhoto.create({
    data: {
      boardId,
      s3Key: input.s3Key,
      url: input.url,
      inspirationPhotoId: input.inspirationPhotoId ?? null,
      orderIndex: count,
    },
  });
}
