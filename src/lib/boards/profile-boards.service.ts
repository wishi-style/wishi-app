// Stylist profile boards. Same polymorphic Board model as session moodboards,
// but with sessionId=null + stylistProfileId + isFeaturedOnProfile + profileStyle.
// The polymorphic CHECK constraint (phase 4) allows this — the profile-board
// rows skip the session path entirely.

import { prisma } from "@/lib/prisma";
import { DomainError, NotFoundError } from "@/lib/errors/domain-error";
import type { Board, BoardPhoto, BoardType } from "@/generated/prisma/client";
import {
  validateCanvasWidth,
  normaliseCanvasRotation,
  validateProcessedImageUrl,
} from "@/lib/boards/styleboard.service";

export const MIN_BOARDS_PER_STYLE = 3;
export const MAX_BOARDS_PER_STYLE = 10;
export const MIN_STYLEBOARD_ITEMS = 3;
export const MIN_MOODBOARD_PHOTOS = 1;

export async function createProfileBoard(input: {
  stylistUserId: string;
  profileStyle: string;
  type?: BoardType;
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

  // Draft: starts unfeatured. publishProfileBoard flips isFeaturedOnProfile
  // once the stylist has added enough content (≥1 photo for moodboards,
  // ≥3 items for styleboards). Keeps drafts off the public profile.
  return prisma.board.create({
    data: {
      type: input.type ?? "MOODBOARD",
      sessionId: null,
      stylistProfileId: stylist.id,
      isFeaturedOnProfile: false,
      profileStyle: input.profileStyle,
    },
  });
}

/**
 * Publish a sessionless profile board: validates minimum content, sets
 * the cover + style + optional title/description/tags, and flips
 * isFeaturedOnProfile=true. Ownership enforced via stylistProfile.userId.
 */
export interface PublishStyleboardItem {
  source: "INVENTORY" | "CLOSET" | "INSPIRATION_PHOTO" | "WEB_ADDED";
  inventoryProductId?: string | null;
  closetItemId?: string | null;
  inspirationPhotoId?: string | null;
  webItemUrl?: string | null;
  webItemTitle?: string | null;
  webItemBrand?: string | null;
  webItemPriceInCents?: number | null;
  webItemImageUrl?: string | null;
  x?: number | null;
  y?: number | null;
  width?: number | null;
  rotation?: number | null;
  zIndex?: number | null;
  flipH?: boolean;
  flipV?: boolean;
  cropTop?: number | null;
  cropRight?: number | null;
  cropBottom?: number | null;
  cropLeft?: number | null;
  processedImageUrl?: string | null;
}

export async function publishProfileBoard(input: {
  stylistUserId: string;
  boardId: string;
  profileStyle?: string;
  coverUrl?: string | null;
  title?: string | null;
  description?: string | null;
  tags?: string[];
  // Styleboard variant: replaces existing BoardItem rows inside the same
  // transaction that flips isFeaturedOnProfile. Ignored for moodboards.
  items?: PublishStyleboardItem[];
}): Promise<Board> {
  const board = await prisma.board.findUnique({
    where: { id: input.boardId },
    include: {
      stylistProfile: { select: { userId: true } },
      photos: { select: { id: true } },
      items: { select: { id: true } },
    },
  });
  if (!board || board.sessionId !== null) {
    throw new NotFoundError("Profile board not found");
  }
  if (!board.stylistProfile || board.stylistProfile.userId !== input.stylistUserId) {
    throw new NotFoundError("Profile board not found");
  }
  if (board.type === "MOODBOARD" && board.photos.length < MIN_MOODBOARD_PHOTOS) {
    throw new DomainError(
      `Add at least ${MIN_MOODBOARD_PHOTOS} photo before publishing`,
      400,
    );
  }
  if (board.type === "STYLEBOARD") {
    const itemCount = input.items ? input.items.length : board.items.length;
    if (itemCount < MIN_STYLEBOARD_ITEMS) {
      throw new DomainError(
        `Styleboards require at least ${MIN_STYLEBOARD_ITEMS} items`,
        400,
      );
    }
  }
  const trimmedStyle =
    input.profileStyle?.trim() || board.profileStyle?.trim() || null;
  if (!trimmedStyle) {
    throw new DomainError("Pick a style label before publishing", 400);
  }
  const trimmedTitle = input.title?.trim() || null;
  const trimmedDescription = input.description?.trim() || null;
  const trimmedTags = (input.tags ?? [])
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10);
  const coverUrl = input.coverUrl?.trim() || null;
  const itemsToInsert = board.type === "STYLEBOARD" ? input.items : undefined;

  return prisma.$transaction(async (tx) => {
    if (itemsToInsert) {
      await tx.boardItem.deleteMany({ where: { boardId: input.boardId } });
      if (itemsToInsert.length > 0) {
        await tx.boardItem.createMany({
          data: itemsToInsert.map((it, idx) => ({
            boardId: input.boardId,
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
            width: validateCanvasWidth(it.width),
            rotation: normaliseCanvasRotation(it.rotation),
            zIndex: it.zIndex ?? null,
            flipH: it.flipH ?? false,
            flipV: it.flipV ?? false,
            cropTop: it.cropTop ?? null,
            cropRight: it.cropRight ?? null,
            cropBottom: it.cropBottom ?? null,
            cropLeft: it.cropLeft ?? null,
            processedImageUrl: validateProcessedImageUrl(it.processedImageUrl),
          })),
        });
      }
    }
    return tx.board.update({
      where: { id: input.boardId },
      data: {
        isFeaturedOnProfile: true,
        profileStyle: trimmedStyle,
        // STYLEBOARDs that are featured but never `sentAt` aren't legal in
        // chat (they were never delivered to any client), but on the public
        // profile they're fine. Mark sentAt so /board/[id] click-through
        // (which 404s drafts) still works for profile-only looks.
        ...(board.type === "STYLEBOARD" && board.sentAt == null
          ? { sentAt: new Date() }
          : {}),
        ...(coverUrl != null ? { coverUrl } : {}),
        ...(trimmedTitle != null ? { title: trimmedTitle } : {}),
        ...(trimmedDescription != null ? { description: trimmedDescription } : {}),
        ...(trimmedTags.length > 0 ? { tags: trimmedTags } : {}),
      },
    });
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
      // Up to 4 photos so the manager card can render a 2x2 collage for
      // moodboards.
      photos: { orderBy: { orderIndex: "asc" }, take: 4 },
      // BoardItems so STYLEBOARDs render a multi-item collage instead of
      // a single cover. INVENTORY items have only an inventoryProductId
      // (image lives in tastegraph) — `resolveThumbnailsForBoards` does
      // that resolution in the page loader.
      items: {
        orderBy: { orderIndex: "asc" },
        take: 8,
        select: {
          source: true,
          inventoryProductId: true,
          webItemImageUrl: true,
          closetItem: { select: { url: true } },
          inspirationPhoto: { select: { url: true } },
        },
      },
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
