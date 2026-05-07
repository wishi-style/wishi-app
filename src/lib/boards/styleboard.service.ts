import { prisma } from "@/lib/prisma";
import { openAction, resolveAction } from "@/lib/pending-actions";
import {
  sendBoardMessage,
  sendBoardUpdateEvent,
} from "@/lib/chat/send-message";
import { notifyClient, notifyStylist } from "@/lib/notifications/dispatcher";
import { endTrialEarly } from "@/lib/payments/subscription-trial";
import { detectPendingEnd } from "@/lib/sessions/transitions";
import { BoardSendError } from "./moodboard.service";
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
  // Phase 12: LookCreator canvas composition.
  x?: number | null;
  y?: number | null;
  zIndex?: number | null;
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
      x: input.x ?? null,
      y: input.y ?? null,
      zIndex: input.zIndex ?? null,
    },
  });
}

export interface PatchStyleboardItemInput {
  x?: number;
  y?: number;
  zIndex?: number;
  flipH?: boolean;
  flipV?: boolean;
  cropTop?: number | null;
  cropRight?: number | null;
  cropBottom?: number | null;
  cropLeft?: number | null;
}

export async function patchStyleboardItem(
  boardId: string,
  itemId: string,
  patch: PatchStyleboardItemInput,
): Promise<BoardItem> {
  const existing = await prisma.boardItem.findUnique({
    where: { id: itemId },
    select: { boardId: true },
  });
  if (!existing || existing.boardId !== boardId) {
    throw new Error(`Item ${itemId} not found on board ${boardId}`);
  }
  return prisma.boardItem.update({
    where: { id: itemId },
    data: {
      ...(patch.x !== undefined ? { x: patch.x } : {}),
      ...(patch.y !== undefined ? { y: patch.y } : {}),
      ...(patch.zIndex !== undefined ? { zIndex: patch.zIndex } : {}),
      ...(patch.flipH !== undefined ? { flipH: patch.flipH } : {}),
      ...(patch.flipV !== undefined ? { flipV: patch.flipV } : {}),
      ...(patch.cropTop !== undefined ? { cropTop: patch.cropTop } : {}),
      ...(patch.cropRight !== undefined ? { cropRight: patch.cropRight } : {}),
      ...(patch.cropBottom !== undefined ? { cropBottom: patch.cropBottom } : {}),
      ...(patch.cropLeft !== undefined ? { cropLeft: patch.cropLeft } : {}),
    },
  });
}

export async function removeStyleboardItem(
  boardId: string,
  itemId: string,
): Promise<void> {
  const { count } = await prisma.boardItem.deleteMany({
    where: { id: itemId, boardId },
  });
  if (count === 0) {
    throw new Error(`Item ${itemId} not found on board ${boardId}`);
  }
}

export async function reorderStyleboardItems(
  boardId: string,
  order: string[],
): Promise<void> {
  const existing = await prisma.boardItem.findMany({
    where: { boardId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((i) => i.id));
  if (order.length !== existingIds.size) {
    throw new Error(
      `reorder payload has ${order.length} ids but board has ${existingIds.size}`,
    );
  }
  for (const id of order) {
    if (!existingIds.has(id)) {
      throw new Error(`Item ${id} does not belong to board ${boardId}`);
    }
  }
  await prisma.$transaction(
    order.map((id, idx) =>
      prisma.boardItem.updateMany({
        where: { id, boardId },
        data: { orderIndex: idx },
      }),
    ),
  );
}

/**
 * Send a styleboard. Fires the STYLEBOARD (or RESTYLE if isRevision) chat
 * message and increments the counters.
 */
export interface SendStyleboardItemInput
  extends Omit<AddItemInput, "x" | "y" | "zIndex"> {
  x?: number | null;
  y?: number | null;
  zIndex?: number | null;
  flipH?: boolean;
  flipV?: boolean;
  cropTop?: number | null;
  cropRight?: number | null;
  cropBottom?: number | null;
  cropLeft?: number | null;
}

export interface SendStyleboardInput {
  title?: string;
  description?: string;
  tags?: string[];
  // Optional canvas snapshot. When provided, replaces existing BoardItem rows
  // inside the same transaction that flips sentAt — so a fresh board with
  // only client-side canvas state can save & send in one round-trip without
  // a separate items-persist pass.
  items?: SendStyleboardItemInput[];
}

export async function sendStyleboard(
  boardId: string,
  input: SendStyleboardInput = {},
): Promise<Board> {
  const board = await prisma.board.findUniqueOrThrow({
    where: { id: boardId },
    include: {
      items: true,
      session: {
        select: {
          id: true,
          stylistId: true,
          clientId: true,
          status: true,
          styleboardsSent: true,
          styleboardsAllowed: true,
          bonusBoardsGranted: true,
        },
      },
    },
  });
  if (board.type !== "STYLEBOARD") {
    throw new BoardSendError("NOT_STYLEBOARD", `Board ${boardId} is not a styleboard`, 400);
  }
  if (!board.sessionId || !board.session) {
    throw new BoardSendError("NO_SESSION", `Styleboard ${boardId} has no session`, 400);
  }
  if (board.sentAt) return board;
  if (board.session.status !== "ACTIVE") {
    throw new BoardSendError(
      "SESSION_NOT_ACTIVE",
      `Cannot send a styleboard on a ${board.session.status} session`,
      409,
    );
  }
  // Revisions don't count against the styleboards allowance — they consume
  // a bonus slot opened by `rateStyleboard(REVISE)`. Plain styleboards do.
  if (!board.isRevision) {
    const totalAllowed = board.session.styleboardsAllowed + board.session.bonusBoardsGranted;
    if (board.session.styleboardsSent >= totalAllowed) {
      throw new BoardSendError(
        "STYLEBOARD_LIMIT",
        `This plan allows ${totalAllowed} styleboard(s); ${board.session.styleboardsSent} already sent`,
        409,
      );
    }
  }
  // If the caller supplied a canvas snapshot, validate the polymorphic shape
  // up-front so we don't half-write items inside the transaction. When no
  // snapshot is supplied we fall back to whatever items are already on the
  // board (the legacy per-item-POST flow).
  if (input.items) {
    for (const it of input.items) {
      validatePolymorphism(it);
    }
    if (input.items.length < 3) {
      throw new BoardSendError(
        "TOO_FEW_ITEMS",
        "Styleboards require at least 3 items",
        400,
      );
    }
  } else if (board.items.length < 3) {
    throw new BoardSendError(
      "TOO_FEW_ITEMS",
      "Styleboards require at least 3 items",
      400,
    );
  }

  const sessionId = board.sessionId;
  const isRevision = board.isRevision;
  const title = input.title?.trim() || null;
  const description = input.description?.trim() || null;
  const tags = (input.tags ?? [])
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10);
  const itemsToInsert = input.items;

  // Atomic compare-and-set on sentAt: null. If a concurrent send already
  // transitioned the row, `updated` is null and we return without
  // re-running counters / side effects.
  const updated = await prisma.$transaction(async (tx) => {
    let itemCount = board.items.length;
    if (itemsToInsert) {
      await tx.boardItem.deleteMany({ where: { boardId } });
      if (itemsToInsert.length > 0) {
        await tx.boardItem.createMany({
          data: itemsToInsert.map((it, idx) => ({
            boardId,
            source: it.source,
            orderIndex: idx,
            inventoryProductId: it.inventoryProductId ?? null,
            closetItemId: it.closetItemId ?? null,
            inspirationPhotoId: it.inspirationPhotoId ?? null,
            webItemUrl: it.webItemUrl ?? null,
            webItemTitle: it.webItemTitle ?? null,
            webItemBrand: it.webItemBrand ?? null,
            webItemPriceInCents: it.webItemPriceInCents ?? null,
            webItemImageUrl: it.webItemImageUrl ?? null,
            x: it.x ?? null,
            y: it.y ?? null,
            zIndex: it.zIndex ?? null,
            flipH: it.flipH ?? false,
            flipV: it.flipV ?? false,
            cropTop: it.cropTop ?? null,
            cropRight: it.cropRight ?? null,
            cropBottom: it.cropBottom ?? null,
            cropLeft: it.cropLeft ?? null,
          })),
        });
      }
      itemCount = itemsToInsert.length;
    }

    const { count } = await tx.board.updateMany({
      where: { id: boardId, sentAt: null },
      data: {
        sentAt: new Date(),
        ...(title != null ? { title } : {}),
        ...(description != null ? { description } : {}),
        ...(tags.length > 0 ? { tags } : {}),
      },
    });
    if (count === 0) return null;
    await tx.session.update({
      where: { id: sessionId },
      data: {
        styleboardsSent: { increment: 1 },
        ...(isRevision ? { revisionsSent: { increment: 1 } } : {}),
        itemsSent: { increment: itemCount },
      },
    });
    // Resolve the PENDING_STYLEBOARD gate that `rateMoodboard(LOVE)` opens.
    await resolveAction(sessionId, "PENDING_STYLEBOARD", { tx });
    if (isRevision) {
      await resolveAction(sessionId, "PENDING_RESTYLE", { tx });
    }
    await openAction(sessionId, "PENDING_CLIENT_FEEDBACK", {
      boardId,
      tx,
    });
    return tx.board.findUniqueOrThrow({ where: { id: boardId } });
  });

  if (!updated) {
    // Lost the race — return the already-sent board, skip side effects.
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
      kind: isRevision ? "RESTYLE" : "STYLEBOARD",
      boardId,
      body: "",
    });
  }
  // Loveable contract: the styleboard card appearing in chat IS the delivery
  // signal. No "created a styleboard for you" stage bubble.
  await notifyClient(sessionId, {
    event: isRevision ? "restyle.sent" : "styleboard.sent",
    title: isRevision ? "Revised look" : "New styleboard",
    body: `${stylist?.firstName ?? "Your stylist"} sent you a new ${isRevision ? "revised look" : "styleboard"}.`,
    url: `/sessions/${sessionId}/chat`,
  });

  // Lux milestone payout: fires when styleboardsSent reaches the plan's
  // luxMilestoneLookNumber (3 for Lux). Idempotent via @@unique on
  // (sessionId, trigger). Revisions don't count toward the milestone (a
  // restyle is still within the existing look's allowance).
  if (!isRevision) {
    await maybeDispatchLuxMilestone(sessionId);
  }

  // Auto-progress to PENDING_END when this was the last deliverable.
  await detectPendingEnd(sessionId).catch((err) => {
    console.warn("[styleboard] detectPendingEnd failed", { sessionId, err });
  });

  return updated;
}

/**
 * Lux milestone payout hook. Fires on the first non-revision styleboard that
 * reaches `Plan.luxMilestoneLookNumber`. Swallows errors — a failed milestone
 * payout should not block the board from reaching the client.
 */
async function maybeDispatchLuxMilestone(sessionId: string): Promise<void> {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { planType: true, styleboardsSent: true },
    });
    if (!session) return;
    const plan = await prisma.plan.findUnique({
      where: { type: session.planType },
      select: {
        payoutTrigger: true,
        luxMilestoneLookNumber: true,
      },
    });
    if (!plan || plan.payoutTrigger === "SESSION_COMPLETED") return;
    if (plan.luxMilestoneLookNumber == null) return;
    if (session.styleboardsSent !== plan.luxMilestoneLookNumber) return;

    const { dispatchPayout } = await import("@/lib/payouts/dispatch.service");
    await dispatchPayout({ sessionId, trigger: "LUX_THIRD_LOOK" });
  } catch (error) {
    console.error("[styleboard] Lux milestone dispatch failed", { sessionId, error });
  }
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
  // Loveable RestyleWizard structured payload (per-item chips + notes).
  // Stored on Board.feedbackDetail for full fidelity. Optional — inline pills
  // (LOVE / NOT_MY_STYLE) submit without it.
  feedbackDetail?: unknown;
}

export interface RateStyleboardResult {
  board: Board;
  restyleBoard: Board | null;
}

/**
 * Client rates a styleboard.
 *  - LOVE: resolves pending feedback. The chosen pill flips in place.
 *  - REVISE: increments bonusBoardsGranted, creates a child restyle board
 *    (draft, not sent), stores per-item feedback, opens PENDING_RESTYLE.
 *    Stylist's queue picks up the new board.
 *  - NOT_MY_STYLE: resolves feedback.
 *
 * In every branch, dispatches a non-rendered BOARD_UPDATE realtime event so
 * both sides' open cards refetch and reflect the rating without a stage
 * bubble. The card flipping IS the in-chat signal. Out-of-chat
 * notifications (push/email) still fire via the dispatcher.
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
  if (!board.sentAt) {
    throw new Error(`Styleboard ${boardId} has not been sent — cannot rate`);
  }
  if (board.rating != null) {
    throw new Error(`Styleboard ${boardId} has already been rated`);
  }
  const sessionId = board.sessionId;
  const subscriptionId = board.session.subscriptionId;

  const result = await prisma.$transaction(async (tx) => {
    // Atomic rate: only transition rows that haven't been rated yet.
    // Prevents re-rate races from creating multiple restyle boards or
    // re-incrementing bonusBoardsGranted.
    const { count } = await tx.board.updateMany({
      where: { id: boardId, rating: null, sentAt: { not: null } },
      data: {
        rating: input.rating,
        feedbackText: input.feedbackText ?? null,
        feedbackDetail:
          input.feedbackDetail === undefined
            ? undefined
            : (input.feedbackDetail as Prisma.InputJsonValue),
        ratedAt: new Date(),
      },
    });
    if (count === 0) {
      throw new Error(`Styleboard ${boardId} was already rated`);
    }
    const updatedBoard = await tx.board.findUniqueOrThrow({
      where: { id: boardId },
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

  // Realtime channel for the stylist's open card to refetch its summary.
  // Non-rendered chat event; replaces the FEEDBACK_*_LOVE / RESTYLE_REQUESTED
  // stage bubbles we used to dispatch.
  await sendBoardUpdateEvent(sessionId, boardId).catch((err) => {
    console.warn("[styleboard] BOARD_UPDATE dispatch failed", { sessionId, boardId, err });
  });
  // If a child restyle board was created on REVISE, dispatch one for it too
  // so the stylist's queue picks it up in real time.
  if (result.restyleBoard) {
    await sendBoardUpdateEvent(sessionId, result.restyleBoard.id).catch((err) => {
      console.warn("[styleboard] BOARD_UPDATE (restyle) dispatch failed", {
        sessionId,
        restyleBoardId: result.restyleBoard?.id,
        err,
      });
    });
  }

  // Loveable contract: the styleboard card flips in place to show the rating.
  // No "loved this look" / "requested a restyle" stage bubbles. Out-of-chat
  // notifications still fire so the stylist gets paged off-session.
  if (input.rating === "LOVE") {
    await notifyStylist(sessionId, {
      event: "styleboard.reviewed",
      title: "Styleboard loved",
      body: `${clientFirstName} loved this look!`,
      url: `/stylist/dashboard?session=${sessionId}`,
    });
  } else if (input.rating === "REVISE") {
    await notifyStylist(sessionId, {
      event: "styleboard.reviewed",
      title: "Revise requested",
      body: `${clientFirstName} requested a restyle.`,
      url: `/stylist/dashboard?session=${sessionId}`,
    });
  } else {
    await notifyStylist(sessionId, {
      event: "styleboard.reviewed",
      title: "Styleboard feedback",
      body: `${clientFirstName} wasn't feeling this look.`,
      url: `/stylist/dashboard?session=${sessionId}`,
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
