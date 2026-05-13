import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import {
  loadShopInventory,
  type ShopInventoryRequest,
} from "@/lib/inventory/shop-inventory.service";

export const dynamic = "force-dynamic";

/**
 * POST /api/stylist/profile/shop-inventory
 *
 * Sessionless counterpart to /api/stylist/sessions/[id]/shop-inventory.
 * Drives the Shop tab on the profile-board styleboard creator, where there
 * is no client session to attribute filters to. `loadShopInventory` handles
 * the null sessionId internally — zero-state client context, generic catalog
 * ranked by the stylist's explicit filters alone.
 */
export async function POST(req: Request) {
  await requireRole("STYLIST");

  const body = (await req
    .json()
    .catch(() => ({}))) as Omit<ShopInventoryRequest, "sessionId">;

  const result = await loadShopInventory({ sessionId: null, ...body });
  return NextResponse.json(result);
}
