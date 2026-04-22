import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * PHASE 10 STUB — real LLM-backed pill generation lands in Phase 7.
 *
 * Returns 6 category-aware feedback pills. The Phase 7 implementation will
 * replace the body with `ai.service.ts#generateSuggestedFeedback(itemId)`
 * using the client's style profile and the item's attributes. The route
 * shape and response contract must not change so UI consumers don't need
 * a swap.
 */
const GENERIC_PILLS = [
  "Love this",
  "Show me alternatives",
  "Too boxy",
  "Wrong color",
  "Would size up",
  "Different fabric",
] as const;

const CATEGORY_PILLS: Record<string, readonly string[]> = {
  dress: [
    "Love this",
    "A bit too short",
    "A bit too long",
    "Different neckline",
    "Different color",
    "More casual version",
  ],
  top: [
    "Love this",
    "Would size up",
    "Different color",
    "Different fabric",
    "More fitted",
    "More relaxed",
  ],
  bottom: [
    "Love this",
    "Different color",
    "Different rise",
    "More relaxed fit",
    "More tailored",
    "Show alternatives",
  ],
  shoe: [
    "Love this",
    "Different color",
    "Lower heel",
    "More comfortable",
    "Different toe shape",
    "Show alternatives",
  ],
  outerwear: [
    "Love this",
    "Different fabric",
    "Longer version",
    "Shorter version",
    "Different color",
    "Show alternatives",
  ],
};

function pillsFor(categorySlug: string | null | undefined) {
  if (!categorySlug) return GENERIC_PILLS;
  const slug = categorySlug.toLowerCase();
  for (const key of Object.keys(CATEGORY_PILLS)) {
    if (slug.includes(key)) return CATEGORY_PILLS[key];
  }
  return GENERIC_PILLS;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ boardItemId: string }> },
) {
  await requireAuth();
  const { boardItemId } = await params;

  const item = await prisma.boardItem.findUnique({
    where: { id: boardItemId },
    select: { id: true, inventoryProductId: true },
  });
  if (!item) {
    return NextResponse.json({ error: "Board item not found" }, { status: 404 });
  }

  // No category lookup against inventory service in the stub — generic pills.
  const pills = pillsFor(null);
  return NextResponse.json({
    pills,
    source: "stub" as const,
    boardItemId: item.id,
  });
}
