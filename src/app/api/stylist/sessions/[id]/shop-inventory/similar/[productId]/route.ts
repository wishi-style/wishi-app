import { NextResponse } from "next/server";
import { forbidden } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadShopInventory } from "@/lib/inventory/shop-inventory.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/stylist/sessions/[id]/shop-inventory/similar/[productId]
 *
 * Power mode: vector-search the catalog for items semantically similar to
 * the given product. Pulls the product's first listing embedding, then
 * queries pgvector cosine distance on the same 1024-dim space.
 *
 * Optional `?limit` query param (1–60, default 24).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; productId: string }> },
) {
  const { userId: clerkId } = await requireRole("STYLIST");
  const { id: sessionId, productId } = await params;

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

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? 24);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(60, Math.max(1, Math.floor(limitRaw)))
      : 24;

  const result = await loadShopInventory({
    sessionId,
    similarToProductId: productId,
    page: 1,
    pageSize: limit,
  });
  return NextResponse.json(result);
}
