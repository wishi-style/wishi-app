import { NextResponse } from "next/server";
import { forbidden } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProduct } from "@/lib/inventory/inventory-client";
import { loadLookPieces } from "@/lib/inventory/shop-inventory.service";
import type { CategoryBucket } from "@/lib/inventory/adapt-product-doc";

export const dynamic = "force-dynamic";

interface LookPiecesBody {
  /** Pre-resolved listing ids (preferred). */
  canvasListingIds?: string[];
  /** Or product ids — server resolves each to its first listing. */
  canvasProductIds?: string[];
  filledBuckets: Exclude<CategoryBucket, "all">[];
  perBucket?: number;
}

/**
 * POST /api/stylist/sessions/[id]/shop-inventory/look-pieces
 *
 * Power mode: given the canvas's listing ids + the buckets the stylist has
 * already filled, return per-bucket candidates for the missing pieces. Fires
 * one `searchBatch` of N direction-mode queries (one per missing bucket) so
 * the embedding model is invoked once per request.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await requireRole("STYLIST");
  const { id: sessionId } = await params;

  const stylistUser = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!stylistUser) forbidden();

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { stylistId: true },
  });
  if (!session || session.stylistId !== stylistUser.id) {
    forbidden();
  }

  const body = (await req.json().catch(() => ({}))) as Partial<LookPiecesBody>;
  let listingIds = body.canvasListingIds ?? [];
  if (
    listingIds.length === 0 &&
    body.canvasProductIds &&
    body.canvasProductIds.length > 0
  ) {
    const resolved = await Promise.all(
      body.canvasProductIds.slice(0, 12).map((pid) => getProduct(pid)),
    );
    listingIds = resolved.flatMap((doc) => {
      const lid = doc?.listings?.[0]?.listing_id;
      return lid ? [lid] : [];
    });
  }
  if (listingIds.length === 0) {
    return NextResponse.json(
      { error: "canvasListingIds or canvasProductIds is required" },
      { status: 400 },
    );
  }

  const result = await loadLookPieces({
    sessionId,
    canvasListingIds: listingIds,
    filledBuckets: body.filledBuckets ?? [],
    perBucket: body.perBucket,
  });
  return NextResponse.json(result);
}
