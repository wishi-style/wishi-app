import { NextResponse } from "next/server";
import { forbidden } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  loadShopInventory,
  type ShopInventoryRequest,
} from "@/lib/inventory/shop-inventory.service";

export const dynamic = "force-dynamic";

/**
 * POST /api/stylist/sessions/[id]/shop-inventory
 *
 * Driven by the LookCreator Shop workspace. Body is an
 * `Omit<ShopInventoryRequest, "sessionId">` — filters, pagination, dismissed
 * smart defaults, and optional power-mode invocations (`similarToProductId`
 * or `directionFromListingIds`).
 *
 * Session ownership is verified server-side so a stylist can't browse a
 * different stylist's session-scoped client context.
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

  const body = (await req
    .json()
    .catch(() => ({}))) as Omit<ShopInventoryRequest, "sessionId">;

  const result = await loadShopInventory({ sessionId, ...body });
  return NextResponse.json(result);
}
