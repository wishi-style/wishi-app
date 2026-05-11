import { NextResponse } from "next/server";
import { forbidden } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProduct } from "@/lib/inventory/inventory-client";
import {
  loadShopInventory,
  type ShopInventoryRequest,
} from "@/lib/inventory/shop-inventory.service";

export const dynamic = "force-dynamic";

interface LooksLikeBody {
  /** Pre-resolved listing ids (preferred). */
  listingIds?: string[];
  /** Or product ids — server resolves each to its first listing. */
  productIds?: string[];
  page?: number;
  pageSize?: number;
  /** Additional filters to overlay (gender, inStockOnly, etc.). */
  filters?: Omit<ShopInventoryRequest, "sessionId" | "page" | "pageSize">;
}

/**
 * POST /api/stylist/sessions/[id]/shop-inventory/looks-like
 *
 * Power mode: feed the canvas's listing ids in, get back a page of inventory
 * that "looks like" the average direction vector of those items. Uses the
 * FashionSigLIP 768-dim direction-embedding column on tastegraph
 * `listing_embeddings`.
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

  const body = (await req.json().catch(() => ({}))) as Partial<LooksLikeBody>;
  let listingIds = body.listingIds ?? [];
  if (
    listingIds.length === 0 &&
    body.productIds &&
    body.productIds.length > 0
  ) {
    // Resolve product → first listing in parallel; drop any that 404.
    const resolved = await Promise.all(
      body.productIds.slice(0, 12).map((pid) => getProduct(pid)),
    );
    listingIds = resolved.flatMap((doc) => {
      const lid = doc?.listings?.[0]?.listing_id;
      return lid ? [lid] : [];
    });
  }
  if (listingIds.length === 0) {
    return NextResponse.json(
      { error: "listingIds or productIds is required" },
      { status: 400 },
    );
  }

  const result = await loadShopInventory({
    sessionId,
    ...(body.filters ?? {}),
    directionFromListingIds: listingIds,
    page: body.page ?? 1,
    pageSize: body.pageSize ?? 60,
  });
  return NextResponse.json(result);
}
