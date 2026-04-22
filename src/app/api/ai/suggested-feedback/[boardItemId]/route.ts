import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getProduct } from "@/lib/inventory/inventory-client";

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

/**
 * The id path param is polymorphic: the MoodBoardWizard passes a BoardPhoto
 * id and the RestyleWizard passes a BoardItem id. We try BoardItem first
 * (the more common case), fall back to BoardPhoto, and 404 otherwise.
 *
 * When the id resolves to an inventory-backed BoardItem we fetch the
 * product from the inventory service to key CATEGORY_PILLS by the item's
 * category slug. Photo-only boards and closet/web items fall through to
 * the generic set — Phase 7 will replace all this with an LLM call keyed
 * on the actual item attributes.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ boardItemId: string }> },
) {
  await requireAuth();
  const { boardItemId: id } = await params;

  const item = await prisma.boardItem.findUnique({
    where: { id },
    select: { id: true, inventoryProductId: true },
  });

  if (item) {
    let categorySlug: string | null = null;
    if (item.inventoryProductId) {
      const product = await getProduct(item.inventoryProductId);
      categorySlug = product?.category_slug ?? null;
    }
    return NextResponse.json({
      pills: pillsFor(categorySlug),
      source: "stub" as const,
      boardItemId: item.id,
    });
  }

  const photo = await prisma.boardPhoto.findUnique({
    where: { id },
    select: { id: true },
  });
  if (photo) {
    // Moodboard photos don't carry a category — generic set is intentional
    // at this layer. Phase 7 will CLIP-embed the photo and key pills by
    // visual attributes instead.
    return NextResponse.json({
      pills: pillsFor(null),
      source: "stub" as const,
      boardPhotoId: photo.id,
    });
  }

  return NextResponse.json(
    { error: "Board item or photo not found" },
    { status: 404 },
  );
}
