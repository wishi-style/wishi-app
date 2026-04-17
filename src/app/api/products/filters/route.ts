import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server-auth";
import { getFilters } from "@/lib/inventory/inventory-client";

export const dynamic = "force-dynamic";

/**
 * GET /api/products/filters — returns the brand / category / color / size
 * facets the inventory service exposes. Powers the board-builder filter
 * sidebar. Cached 5 minutes in the inventory client.
 */
export async function GET() {
  const { userId } = await getServerAuth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const filters = await getFilters();
  return NextResponse.json(filters);
}
