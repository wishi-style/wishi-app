import { prisma } from "@/lib/prisma";
import type { AffiliateClick, Order } from "@/generated/prisma/client";

export type AffiliateClickWithOrder = AffiliateClick & { order: Order | null };

export interface RecordClickInput {
  userId: string;
  inventoryProductId: string;
  inventoryListingId?: string;
  retailer: string;
  url: string;
  sessionId?: string;
  boardId?: string;
}

export async function recordClick(
  input: RecordClickInput,
): Promise<AffiliateClick> {
  return prisma.affiliateClick.create({
    data: {
      userId: input.userId,
      inventoryProductId: input.inventoryProductId,
      inventoryListingId: input.inventoryListingId ?? null,
      retailer: input.retailer,
      url: input.url,
      sessionId: input.sessionId ?? null,
      boardId: input.boardId ?? null,
    },
  });
}

/**
 * Clicks older than `thresholdHours` that have never been prompted.
 * Used by the affiliate-prompt worker to fan out the self-report ask.
 */
export async function findUnpromptedClicks(
  thresholdHours = 24,
  limit = 500,
): Promise<AffiliateClick[]> {
  const cutoff = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);
  return prisma.affiliateClick.findMany({
    where: {
      clickedAt: { lt: cutoff },
      promptSentAt: null,
      orderId: null,
    },
    orderBy: { clickedAt: "asc" },
    take: limit,
  });
}

export async function markPromptSent(clickId: string): Promise<void> {
  await prisma.affiliateClick.update({
    where: { id: clickId },
    data: { promptSentAt: new Date() },
  });
}

export async function linkOrder(
  clickId: string,
  orderId: string,
): Promise<void> {
  await prisma.affiliateClick.update({
    where: { id: clickId },
    data: { orderId },
  });
}

/**
 * Find candidate clicks for a commission event: same product, same retailer,
 * clicked within a ±7-day window of the commission's order_placed_at.
 * Used by the affiliate-ingest worker's dedup logic.
 */
export async function findCandidateClicks(
  inventoryProductId: string,
  merchantName: string,
  orderPlacedAt: Date,
  windowDays = 7,
): Promise<AffiliateClickWithOrder[]> {
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  return prisma.affiliateClick.findMany({
    where: {
      inventoryProductId,
      retailer: merchantName,
      clickedAt: {
        gte: new Date(orderPlacedAt.getTime() - windowMs),
        lte: new Date(orderPlacedAt.getTime() + windowMs),
      },
    },
    include: { order: true },
    orderBy: { clickedAt: "desc" },
  });
}

export async function getClickById(
  clickId: string,
): Promise<AffiliateClick | null> {
  return prisma.affiliateClick.findUnique({ where: { id: clickId } });
}
