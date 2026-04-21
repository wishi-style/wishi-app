import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordClick } from "@/lib/affiliate/click-service";

export const dynamic = "force-dynamic";

interface ClickBody {
  inventoryProductId?: string;
  inventoryListingId?: string;
  retailer?: string;
  url?: string;
  sessionId?: string;
  boardId?: string;
}

/**
 * POST /api/affiliate/click — writes an AffiliateClick row when a client
 * taps "Shop at [Retailer]" on an inventory product anywhere in the app
 * (ProductDetailDialog, StyleBoard grid, MyBag rail, Feed).
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as ClickBody;
  if (!body.inventoryProductId || !body.retailer || !body.url) {
    return NextResponse.json(
      { error: "inventoryProductId, retailer, and url required" },
      { status: 400 },
    );
  }

  const click = await recordClick({
    userId: user.id,
    inventoryProductId: body.inventoryProductId,
    inventoryListingId: body.inventoryListingId,
    retailer: body.retailer,
    url: body.url,
    sessionId: body.sessionId,
    boardId: body.boardId,
  });
  return NextResponse.json({ id: click.id }, { status: 201 });
}
