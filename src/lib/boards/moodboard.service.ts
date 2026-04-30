import { prisma } from "@/lib/prisma";
import { openAction, resolveAction } from "@/lib/pending-actions";
import { sendSystemMessage, sendBoardMessage } from "@/lib/chat/send-message";
import { SystemTemplate } from "@/lib/chat/system-templates";
import { notifyClient, notifyStylist } from "@/lib/notifications/dispatcher";
import type { Board, BoardPhoto, BoardRating } from "@/generated/prisma/client";

export async function createMoodboard(
  sessionId: string,
  stylistUserId: string,
): Promise<Board> {
  const stylist = await prisma.stylistProfile.findUniqueOrThrow({
    where: { userId: stylistUserId },
    select: { id: true },
  });
  return prisma.board.create({
    data: {
      type: "MOODBOARD",
      sessionId,
      stylistProfileId: stylist.id,
    },
  });
}

/** Loveable mood-board contract: 9 images max per board. */
export const MOODBOARD_PHOTO_CAP = 9;

export class MoodboardPhotoCapError extends Error {
  readonly code = "MOODBOARD_PHOTO_CAP" as const;
  readonly cap = MOODBOARD_PHOTO_CAP;
  constructor() {
    super(`Moodboards are capped at ${MOODBOARD_PHOTO_CAP} photos`);
    this.name = "MoodboardPhotoCapError";
  }
}

export async function addMoodboardPhoto(
  boardId: string,
  input: { s3Key: string; url: string; inspirationPhotoId?: string | null },
): Promise<BoardPhoto> {
  const count = await prisma.boardPhoto.count({ where: { boardId } });
  if (count >= MOODBOARD_PHOTO_CAP) {
    throw new MoodboardPhotoCapError();
  }
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

export async function removeMoodboardPhoto(photoId: string): Promise<void> {
  await prisma.boardPhoto.delete({ where: { id: photoId } });
}

/**
 * Send a moodboard to the client. Marks sentAt, writes a MOODBOARD chat
 * message, fires the MOODBOARD_DELIVERED system template, rolls pending
 * actions (resolve PENDING_MOODBOARD, open PENDING_CLIENT_FEEDBACK),
 * and increments the session counter.
 */
export async function sendMoodboard(
  boardId: string,
  opts: { note?: string | null } = {},
): Promise<Board> {
  const board = await prisma.board.findUniqueOrThrow({
    where: { id: boardId },
    include: {
      photos: true,
      session: {
        select: {
          id: true,
          clientId: true,
          stylistId: true,
          status: true,
        },
      },
    },
  });
  if (board.type !== "MOODBOARD") {
    throw new Error(`Board ${boardId} is not a moodboard`);
  }
  if (!board.sessionId || !board.session) {
    throw new Error(`Moodboard ${boardId} has no session`);
  }
  if (board.sentAt) return board;
  if (board.photos.length === 0) {
    throw new Error("Cannot send an empty moodboard");
  }

  const sessionId = board.sessionId;

  // Atomic compare-and-set on sentAt: null. If a concurrent send already
  // transitioned the row, skip counters / pending actions / side effects.
  const trimmedNote = opts.note?.trim() || null;
  const updated = await prisma.$transaction(async (tx) => {
    const { count } = await tx.board.updateMany({
      where: { id: boardId, sentAt: null },
      data: {
        sentAt: new Date(),
        ...(trimmedNote != null ? { stylistNote: trimmedNote } : {}),
      },
    });
    if (count === 0) return null;
    await tx.session.update({
      where: { id: sessionId },
      data: { moodboardsSent: { increment: 1 } },
    });
    await resolveAction(sessionId, "PENDING_MOODBOARD", { tx });
    await openAction(sessionId, "PENDING_CLIENT_FEEDBACK", {
      boardId,
      tx,
    });
    return tx.board.findUniqueOrThrow({ where: { id: boardId } });
  });

  if (!updated) {
    return prisma.board.findUniqueOrThrow({ where: { id: boardId } });
  }

  const stylist = board.session.stylistId
    ? await prisma.user.findUnique({
        where: { id: board.session.stylistId },
        select: { firstName: true, clerkId: true },
      })
    : null;

  if (stylist?.clerkId) {
    await sendBoardMessage(sessionId, {
      authorClerkId: stylist.clerkId,
      kind: "MOODBOARD",
      boardId,
      body: "",
    });
  }
  await sendSystemMessage(sessionId, SystemTemplate.MOODBOARD_DELIVERED, {
    stylistFirstName: stylist?.firstName ?? "Your stylist",
  });
  await notifyClient(sessionId, {
    event: "moodboard.sent",
    title: "New moodboard",
    body: `${stylist?.firstName ?? "Your stylist"} shared a moodboard for you.`,
    url: `/sessions/${sessionId}/moodboards/${boardId}`,
  });

  return updated;
}

export type MoodboardRating = Extract<BoardRating, "LOVE" | "NOT_MY_STYLE">;

/**
 * Client rates a moodboard. Moodboards support LOVE and NOT_MY_STYLE only
 * (no Revise). Resolves the PENDING_CLIENT_FEEDBACK action for this board
 * and fires the matching SYSTEM_AUTOMATED acknowledgement. On LOVE, opens
 * PENDING_STYLEBOARD so the stylist is queued to start the first look.
 */
export async function rateMoodboard(
  boardId: string,
  rating: MoodboardRating,
  feedbackText?: string,
): Promise<Board> {
  const board = await prisma.board.findUniqueOrThrow({
    where: { id: boardId },
    include: {
      session: {
        select: { id: true, clientId: true },
      },
    },
  });
  if (board.type !== "MOODBOARD") {
    throw new Error(`Board ${boardId} is not a moodboard`);
  }
  if (!board.sessionId || !board.session) {
    throw new Error(`Moodboard ${boardId} has no session`);
  }
  if (!board.sentAt) {
    throw new Error(`Moodboard ${boardId} has not been sent — cannot rate`);
  }
  if (board.rating != null) {
    throw new Error(`Moodboard ${boardId} has already been rated`);
  }

  const sessionId = board.sessionId;

  // Atomic rate: only transition rows that are sent and not yet rated.
  // Prevents duplicate PENDING_STYLEBOARD actions from re-rate races.
  const updated = await prisma.$transaction(async (tx) => {
    const { count } = await tx.board.updateMany({
      where: { id: boardId, rating: null, sentAt: { not: null } },
      data: { rating, feedbackText: feedbackText ?? null, ratedAt: new Date() },
    });
    if (count === 0) {
      throw new Error(`Moodboard ${boardId} was already rated`);
    }
    await resolveAction(sessionId, "PENDING_CLIENT_FEEDBACK", {
      boardId,
      tx,
    });
    if (rating === "LOVE") {
      await openAction(sessionId, "PENDING_STYLEBOARD", { tx });
    }
    return tx.board.findUniqueOrThrow({ where: { id: boardId } });
  });

  const client = await prisma.user.findUnique({
    where: { id: board.session.clientId },
    select: { firstName: true },
  });
  const template =
    rating === "LOVE"
      ? SystemTemplate.FEEDBACK_MOODBOARD_LOVE
      : SystemTemplate.FEEDBACK_MOODBOARD_NOT_MY_STYLE;
  await sendSystemMessage(sessionId, template, {
    clientFirstName: client?.firstName ?? "The client",
  });
  await notifyStylist(sessionId, {
    event: "moodboard.feedback",
    title: "Moodboard feedback",
    body:
      rating === "LOVE"
        ? `${client?.firstName ?? "Your client"} loved the moodboard.`
        : `${client?.firstName ?? "Your client"} wasn't feeling the moodboard.`,
    url: `/stylist/dashboard?session=${sessionId}`,
  });

  return updated;
}
