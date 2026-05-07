import { prisma } from "@/lib/prisma";
import { openAction, resolveAction } from "@/lib/pending-actions";
import {
  sendBoardMessage,
  sendBoardUpdateEvent,
} from "@/lib/chat/send-message";
import { notifyClient, notifyStylist } from "@/lib/notifications/dispatcher";
import { detectPendingEnd } from "@/lib/sessions/transitions";
import type { Board, BoardPhoto, BoardRating } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";

export class BoardSendError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 409) {
    super(message);
    this.name = "BoardSendError";
    this.code = code;
    this.status = status;
  }
}

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
 * message (the inline card itself IS the in-chat delivery signal — no
 * stage bubble is dispatched), rolls pending actions (resolve
 * PENDING_MOODBOARD, open PENDING_CLIENT_FEEDBACK), increments the
 * session counter, and fans out a push/email notification via the
 * out-of-chat dispatcher.
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
          moodboardsSent: true,
          moodboardsAllowed: true,
        },
      },
    },
  });
  if (board.type !== "MOODBOARD") {
    throw new BoardSendError("NOT_MOODBOARD", `Board ${boardId} is not a moodboard`, 400);
  }
  if (!board.sessionId || !board.session) {
    throw new BoardSendError("NO_SESSION", `Moodboard ${boardId} has no session`, 400);
  }
  if (board.sentAt) return board;
  if (board.photos.length === 0) {
    throw new BoardSendError("EMPTY", "Cannot send an empty moodboard", 400);
  }
  if (board.session.status !== "ACTIVE") {
    throw new BoardSendError(
      "SESSION_NOT_ACTIVE",
      `Cannot send a moodboard on a ${board.session.status} session`,
      409,
    );
  }
  if (board.session.moodboardsSent >= board.session.moodboardsAllowed) {
    throw new BoardSendError(
      "MOODBOARD_LIMIT",
      `This plan allows ${board.session.moodboardsAllowed} moodboard(s); ${board.session.moodboardsSent} already sent`,
      409,
    );
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
  // Loveable contract: the moodboard card appearing in chat IS the delivery
  // signal. No "shared a moodboard with you" stage bubble.
  await notifyClient(sessionId, {
    event: "moodboard.sent",
    title: "New moodboard",
    body: `${stylist?.firstName ?? "Your stylist"} shared a moodboard for you.`,
    url: `/sessions/${sessionId}/chat`,
  });

  // Auto-progress to PENDING_END if all deliverables are now in. Idempotent
  // and a no-op when more boards remain.
  await detectPendingEnd(sessionId).catch((err) => {
    console.warn("[moodboard] detectPendingEnd failed", { sessionId, err });
  });

  return updated;
}

export type MoodboardRating = Extract<BoardRating, "LOVE" | "NOT_MY_STYLE">;

/**
 * Client rates a moodboard. Moodboards support LOVE and NOT_MY_STYLE only
 * (no Revise). Resolves the PENDING_CLIENT_FEEDBACK action for this board
 * and dispatches a non-rendered BOARD_UPDATE realtime event so both sides'
 * open cards refetch in place — no SYSTEM_AUTOMATED stage bubble. On LOVE,
 * opens PENDING_STYLEBOARD so the stylist is queued to start the first look.
 */
export async function rateMoodboard(
  boardId: string,
  rating: MoodboardRating,
  feedbackText?: string,
  feedbackDetail?: unknown,
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
      data: {
        rating,
        feedbackText: feedbackText ?? null,
        feedbackDetail:
          feedbackDetail === undefined
            ? undefined
            : (feedbackDetail as Prisma.InputJsonValue),
        ratedAt: new Date(),
      },
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
  // Loveable contract: the moodboard card flips in place to show the rating.
  // No "loved the moodboard" stage bubble. We do dispatch a non-rendered
  // BOARD_UPDATE Twilio event so the stylist's open card refetches its
  // summary and shows the rating + feedback in real-time.
  await sendBoardUpdateEvent(sessionId, boardId).catch((err) => {
    console.warn("[moodboard] BOARD_UPDATE dispatch failed", { sessionId, boardId, err });
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
