import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getClickById, linkOrder } from "@/lib/affiliate/click-service";
import { createOrder } from "@/lib/orders/order-service";
import { getProduct } from "@/lib/inventory/inventory-client";

export const dynamic = "force-dynamic";

type SelfReportResponse = "yes" | "no" | "partial";

interface SelfReportBody {
  clickId?: string;
  response?: SelfReportResponse;
  quantity?: number;
}

/**
 * POST /api/affiliate/self-report — user confirms "did you buy [X]?".
 * - "yes" | "partial" → creates Order(SELF_REPORTED) + OrderItem snapshot
 *   from the inventory service, links the click, fires closet auto-create.
 * - "no" → no-op beyond acknowledging so we don't prompt again (we
 *   rely on promptSentAt being set by the worker).
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as SelfReportBody;
  if (!body.clickId || !body.response) {
    return NextResponse.json(
      { error: "clickId and response required" },
      { status: 400 },
    );
  }

  const click = await getClickById(body.clickId);
  if (!click || click.userId !== user.id) {
    return NextResponse.json({ error: "Click not found" }, { status: 404 });
  }
  if (click.orderId) {
    return NextResponse.json({ error: "Already reported" }, { status: 409 });
  }

  if (body.response === "no") {
    return NextResponse.json({ ok: true });
  }

  const product = await getProduct(click.inventoryProductId);
  const primary = product?.listings[0];
  const title = product?.canonical_name ?? "Unknown product";
  const brand = product?.brand_name ?? undefined;
  const imageUrl = product?.primary_image_url ?? undefined;
  const priceInCents = Math.round(
    (primary?.sale_price ?? primary?.base_price ?? product?.min_price ?? 0) * 100,
  );
  const quantity = body.quantity ?? 1;

  const order = await createOrder({
    userId: user.id,
    sessionId: click.sessionId ?? undefined,
    source: "SELF_REPORTED",
    retailer: click.retailer,
    totalInCents: priceInCents * quantity,
    items: [
      {
        inventoryProductId: click.inventoryProductId,
        inventoryListingId: click.inventoryListingId ?? undefined,
        title,
        brand,
        imageUrl,
        priceInCents,
        quantity,
      },
    ],
  });

  await linkOrder(click.id, order.id);
  return NextResponse.json({ orderId: order.id }, { status: 201 });
}
