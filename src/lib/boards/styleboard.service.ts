import { prisma } from "@/lib/prisma";
import { openAction, resolveAction } from "@/lib/pending-actions";
import { sendSystemMessage, sendBoardMessage } from "@/lib/chat/send-message";
import { SystemTemplate } from "@/lib/chat/system-templates";
import { notifyClient, notifyStylist } from "@/lib/notifications/dispatcher";
import { endTrialEarly } from "@/lib/payments/subscription-trial";
import type {
  Board,
  BoardItem,
  BoardItemSource,
  BoardRating,
  Prisma,
} from "@/generated/prisma/client";

export async function createStyleboard(options: {
  sessionId: string;
  stylistUserId: string;
  parentBoardId?: string;
}): Promise<Board> {
  const stylist = await prisma.stylistProfile.findUniqueOrThrow({
    where: { userId: options.stylistUserId },
    select: { id: true },
  });
  return prisma.board.create({
    data: {
      type: "STYLEBOARD",
      sessionId: options.sessionId,
      stylistProfileId: stylist.id,
      parentBoardId: options.parentBoardId ?? null,
      isRevision: !!options.parentBoardId,
    },
  });
}

export interface AddItemInput {
  source: BoardItemSource;
  inventoryProductId?: string;
  closetItemId?: string;
  inspirationPhotoId?: string;
  webItemUrl?: string;
  webItemTitle?: string;
  webItemBrand?: string;
  webItemPriceInCents?: number;
  webItemImageUrl?: string;
}

function validatePolymorphism(input: AddItemInput): void {
  const { source } = input;
  const inv = input.inventoryProductId != null;
  const closet = input.closetItemId != null;
  const insp = input.inspirationPhotoId != null;
  const web = input.webItemUrl != null;
  if (source === "INVENTORY" && !(inv && !closet && !insp && !web)) {
    throw new Error("INVENTORY items require only inventoryProductId");
  }
  if (source === "CLOSET" && !(closet && !inv && !insp && !web)) {
    throw new Error("CLOSET items require only closetItemId");
  }
  if (source === "INSPIRATION_PHOTO" && !(insp && !inv && !closet && !web)) {
    throw new Error("INSPIRATION_PHOTO items require only inspirationPhotoId");
  }
  if (source === "WEB_ADDED" && !(web && !inv && !closet && !insp)) {
    throw new Error("WEB_ADDED items require webItemUrl");
  }
}

export async function addStyleboardItem(
  boardId: string,
  input: AddItemInput,
): Promise<BoardItem> {
  validatePolymorphism(input);
  const count = await prisma.boardItem.count({ where: { boardId } });
  return prisma.boardItem.create({
    data: {
      boardId,
      source: input.source,
      orderIndex: count,
      inventoryProductId: input.inventoryProductId ?? null,
      closetItemId: input.closetItemId ?? null,
      inspirationPhotoId: input.inspirationPhotoId ?? null,
      webItemUrl: input.webItemUrl ?? null,
      webItemTitle: input.webItemTitle ?? null,
      webItemBrand: input.webItemBrand ?? null,
      webItemPriceInCents: input.webItemPriceInCents ?? null,
      webItemImageUrl: input.webItemImageUrl ?? null,
    },
  });
}

export async function removeStyleboardItem(itemId: string): Promise<void> {
  await prisma.boardItem.delete({ where: { id: itemId } });
}

export async function reorderStyleboardItems(
  boardId: string,
  order: string[],
): Promise<void> {
  await prisma.$transaction(
    order.map((id, idx) =>
      prisma.boardItem.update({
        where: { id },
        data: { orderIndex: idx },
      }),
    ),
  );
  // Silently ignore items not on this board — guarded by the route handler.
  void boardId;
}

/**
 * Send a styleboard. Fires the STYLEBOARD (or RESTYLE if isRevision) chat
 * message and increments the counters.
 */
export async function sendStyleboard(boardId: string): Promise<Board> {
  const board = await prisma.board.findUniqueOrThrow({
    where: { id: boardId },
    include: {
      items: true,
      session: { select: { id: true, stylistId: true, clientId: true } },
    },
  });
  if (board.type !== "STYLEBOARD") {
    throw new Error(`Board ${boardId} is not a styleboard`);
  }
  if (!board.sessionId || !board.session) {
    throw new Error(`Styleboard ${boardId} has no session`);
  }
  if (board.sentAt) return board;
  if (board.items.length === 0) {
    throw new Error("Cannot send an empty styleboard");
  }

  const sessionId = board.sessionId;
  const isRevision = board.isRevision;

  const updated = await prisma.$transaction(async (tx) => {
    const b = await tx.board.update({
      where: { id: boardId },
      data: { sentAt: new Date() },
    });
    await tx.session.update({
      where: { id: sessionId },
      data: {
        styleboardsSent: { increment: 1 },
        ...(isRevision ? { revisionsSent: { increment: 1 } } : {}),
        itemsSent: { increment: board.items.length },
      },
    });
    // Moodboard may not have been explicitly gated; resolve just in case
    // a styleboard lands without an earlier moodboard decision (edge case).
    await resolveAction(sessionId, "PENDING_STYLEBOARD", { tx });
    if (isRevision) {
      await resolveAction(sessionId, "PENDING_RESTYLE", { tx });
    }
    await openAction(sessionId, "PENDING_CLIENT_FEEDBACK", {
      boardId,
      tx,
    });
    return b;
  });

  const stylist = board.session.stylistId
    ? await prisma.user.findUnique({
        where: { id: board.session.stylistId },
        select: { firstName: true, clerkId: true },
      })
    : null;

  if (stylist?.clerkId) {
    await sendBoardMessage(sessionId, {
      authorClerkId: stylist.clerkId,
      kind: isRevision ? "RESTYLE" : "STYLEBOARD",
      boardId,
      body: "",
    });
  }
  await sendSystemMessage(
    sessionId,
    isRevision ? SystemTemplate.RESTYLE_DELIVERED : SystemTemplate.STYLEBOARD_DELIVERED,
    { stylistFirstName: stylist?.firstName ?? "Your stylist" },
  );
  await notifyClient(sessionId, {
    event: isRevision ? "restyle.sent" : "styleboard.sent",
    title: isRevision ? "Revised look" : "New styleboard",
    body: `${stylist?.firstName ?? "Your stylist"} sent you a new ${isRevision ? "revised look" : "styleboard"}.`,
    url: `/sessions/${sessionId}/styleboards/${boardId}`,
  });

  return updated;
}

export interface ItemFeedback {
  itemId: string;
  reaction: BoardRating;
  feedbackText?: string;
  suggestedFeedback?: string[];
}

export interface RateStyleboardInput {
  rating: BoardRating;
  feedbackText?: string;
  itemFeedback?: ItemFeedback[];
}

export interface RateStyleboardResult {
  board: Board;
  restyleBoard: Board | null;
}

/**
 * Client rates a styleboard.
 *  - LOVE: resolves pending feedback, writes Love system message.
 *  - REVISE: increments bonusBoardsGranted, creates a child restyle board
 *    (draft, not sent), stores per-item feedback, opens PENDING_RESTYLE,
 *    fires RESTYLE_REQUESTED. Stylist's queue then picks up the new board.
 *  - NOT_MY_STYLE: resolves feedback, writes NMS system message.
 *
 * On the first-ever rate in a session (moodboard OR styleboard), if the
 * linked subscription is TRIALING, end the trial immediately to capture
 * the first invoice.
 */
export async function rateStyleboard(
  boardId: string,
  input: RateStyleboardInput,
  clientUserId: string,
): Promise<RateStyleboardResult> {
  const board = await prisma.board.findUniqueOrThrow({
    where: { id: boardId },
    include: {
      session: { select: { id: true, clientId: true, stylistId: true, subscriptionId: true } },
    },
  });
  if (board.type !== "STYLEBOARD") {
    throw new Error(`Board ${boardId} is not a styleboard`);
  }
  if (!board.sessionId || !board.session) {
    throw new Error(`Styleboard ${boardId} has no session`);
  }
  if (board.session.clientId !== clientUserId) {
    throw new Error("Only the client can rate");
  }
  const sessionId = board.sessionId;
  const subscriptionId = board.session.subscriptionId;

  const result = await prisma.$transaction(async (tx) => {
    const updatedBoard = await tx.board.update({
      where: { id: boardId },
      data: {
        rating: input.rating,
        feedbackText: input.feedbackText ?? null,
        ratedAt: new Date(),
      },
    });

    if (input.itemFeedback?.length) {
      await Promise.all(
        input.itemFeedback.map((f) =>
          tx.boardItem.updateMany({
            where: { id: f.itemId, boardId },
            data: {
              reaction: f.reaction,
              feedbackText: f.feedbackText ?? null,
              suggestedFeedback: f.suggestedFeedback ?? [],
            },
          }),
        ),
      );
    }

    await resolveAction(sessionId, "PENDING_CLIENT_FEEDBACK", {
      boardId,
      tx,
    });

    let restyleBoard: Board | null = null;
    if (input.rating === "REVISE") {
      await tx.session.update({
        where: { id: sessionId },
        data: { bonusBoardsGranted: { increment: 1 } },
      });
      const stylistProfile = board.session!.stylistId
        ? await tx.stylistProfile.findUnique({
            where: { userId: board.session!.stylistId },
            select: { id: true },
          })
        : null;
      restyleBoard = await tx.board.create({
        data: {
          type: "STYLEBOARD",
          sessionId,
          stylistProfileId: stylistProfile?.id ?? null,
          parentBoardId: boardId,
          isRevision: true,
        },
      });
      await openAction(sessionId, "PENDING_RESTYLE", {
        boardId: restyleBoard.id,
        tx,
      });
    }

    return { board: updatedBoard, restyleBoard };
  });

  // Trial early-exit: fire on any styleboard rating when subscription exists.
  if (subscriptionId) {
    await endTrialEarly(subscriptionId).catch((err) => {
      console.warn("[styleboard] endTrialEarly failed:", err);
    });
  }

  const client = await prisma.user.findUnique({
    where: { id: board.session.clientId },
    select: { firstName: true },
  });
  const clientFirstName = client?.firstName ?? "The client";

  if (input.rating === "LOVE") {
    await sendSystemMessage(sessionId, SystemTemplate.FEEDBACK_STYLEBOARD_LOVE, {
      clientFirstName,
    });
    await notifyStylist(sessionId, {
      event: "styleboard.reviewed",
      title: "Styleboard loved",
      body: `${clientFirstName} loved this look!`,
      url: `/stylist/sessions/${sessionId}/workspace`,
    });
  } else if (input.rating === "REVISE") {
    await sendSystemMessage(sessionId, SystemTemplate.RESTYLE_REQUESTED, {
      clientFirstName,
    });
    await notifyStylist(sessionId, {
      event: "styleboard.reviewed",
      title: "Revise requested",
      body: `${clientFirstName} requested a restyle.`,
      url: `/stylist/sessions/${sessionId}/workspace`,
    });
  } else {
    await sendSystemMessage(
      sessionId,
      SystemTemplate.FEEDBACK_STYLEBOARD_NOT_MY_STYLE,
      { clientFirstName },
    );
    await notifyStylist(sessionId, {
      event: "styleboard.reviewed",
      title: "Styleboard feedback",
      body: `${clientFirstName} wasn't feeling this look.`,
      url: `/stylist/sessions/${sessionId}/workspace`,
    });
  }

  return result;
}

/** Useful helper for the session workspace "Curated Pieces" tab. */
export async function getSessionBoardItems(
  sessionId: string,
): Promise<(BoardItem & { boardSentAt: Date | null })[]> {
  const boards = await prisma.board.findMany({
    where: { sessionId, type: "STYLEBOARD" },
    include: { items: { orderBy: { orderIndex: "asc" } } },
  });
  const rows: (BoardItem & { boardSentAt: Date | null })[] = [];
  for (const b of boards) {
    for (const it of b.items) {
      rows.push({ ...it, boardSentAt: b.sentAt });
    }
  }
  rows.sort((a, b) => {
    const ta = a.boardSentAt?.getTime() ?? a.createdAt.getTime();
    const tb = b.boardSentAt?.getTime() ?? b.createdAt.getTime();
    return tb - ta;
  });
  return rows;
}

// Type-only export to keep callers explicit in the API layer
export type { BoardItemSource } from "@/generated/prisma/client";
// Surface Prisma types to callers without re-importing Prisma
export type StyleboardTxClient = Prisma.TransactionClient;
