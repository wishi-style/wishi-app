import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProduct } from "@/lib/inventory/inventory-client";

export const dynamic = "force-dynamic";

/**
 * Returns the data the inline styleboard chat card needs to render Loveable's
 * StylingRoom layout in one round-trip:
 *
 *   - `thumbnails`: up to 6 resolved image URLs for the left-column collage.
 *   - `products`: the same items resolved to `{ id, brand, name, image, price,
 *     priceInCents, soldOut, inventoryProductId }` for the right-column
 *     scrollable grid + RestyleWizard binding.
 *
 * Authorization mirrors the parent GET: client + stylist on the session, or
 * admin.
 */

interface PreviewProduct {
  /** BoardItem.id — what the styleboard service references when persisting feedback. */
  id: string;
  brand: string;
  name: string;
  image: string | null;
  price: string;
  priceInCents: number | null;
  soldOut: boolean;
  /** Used by the chat card's "Add to Cart" CTA. Null for non-inventory items. */
  inventoryProductId: string | null;
}

// Format an integer cent amount as a localized currency string. Falls back
// to USD when the upstream product has no currency. Cent precision is
// preserved (Math.round on whole dollars dropped 19.99 → $20).
function formatPrice(amountInCents: number, currency: string | null | undefined): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: amountInCents % 100 === 0 ? 0 : 2,
  }).format(amountInCents / 100);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const board = await prisma.board.findUnique({
    where: { id },
    include: {
      session: { select: { clientId: true, stylistId: true } },
      items: {
        orderBy: { orderIndex: "asc" },
        take: 12,
        include: {
          closetItem: { select: { url: true, name: true, designer: true } },
          inspirationPhoto: { select: { url: true } },
        },
      },
    },
  });

  if (!board || board.type !== "STYLEBOARD") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (
    !board.session ||
    (board.session.clientId !== user.id &&
      board.session.stylistId !== user.id &&
      !user.isAdmin)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Inventory lookups fan out in parallel and are bounded by `take: 12`,
  // and `getProduct` has a 5-minute in-process cache so repeat opens of
  // the same card don't refetch. A true batch endpoint on the upstream
  // tastegraph service is the right long-term fix; tracked separately.
  const resolved = await Promise.all(
    board.items.map(async (item): Promise<PreviewProduct | null> => {
      switch (item.source) {
        case "INVENTORY": {
          if (!item.inventoryProductId) return null;
          const p = await getProduct(item.inventoryProductId).catch(() => null);
          if (!p) return null;
          const minCents = Math.round(p.min_price * 100);
          const maxCents = Math.round(p.max_price * 100);
          const priceStr =
            minCents === maxCents
              ? formatPrice(minCents, p.currency)
              : `${formatPrice(minCents, p.currency)} – ${formatPrice(maxCents, p.currency)}`;
          return {
            id: item.id,
            brand: p.brand_name ?? "Unknown",
            name: p.canonical_name ?? "",
            image: p.primary_image_url ?? null,
            price: priceStr,
            priceInCents: minCents,
            soldOut: !p.in_stock,
            inventoryProductId: item.inventoryProductId,
          };
        }
        case "CLOSET":
          return {
            id: item.id,
            brand: item.closetItem?.designer ?? "Closet",
            name: item.closetItem?.name ?? "",
            image: item.closetItem?.url ?? null,
            price: "",
            priceInCents: null,
            soldOut: false,
            inventoryProductId: null,
          };
        case "INSPIRATION_PHOTO":
          return {
            id: item.id,
            brand: "Inspiration",
            name: "",
            image: item.inspirationPhoto?.url ?? null,
            price: "",
            priceInCents: null,
            soldOut: false,
            inventoryProductId: null,
          };
        case "WEB_ADDED":
          return {
            id: item.id,
            brand: item.webItemBrand ?? "Web",
            name: item.webItemTitle ?? "",
            image: item.webItemImageUrl ?? null,
            price:
              typeof item.webItemPriceInCents === "number"
                ? formatPrice(item.webItemPriceInCents, "USD")
                : "",
            priceInCents: item.webItemPriceInCents ?? null,
            soldOut: false,
            inventoryProductId: null,
          };
        default:
          return null;
      }
    }),
  );

  const products = resolved.filter((p): p is PreviewProduct => p != null);
  const thumbnails = products
    .map((p) => p.image)
    .filter((u): u is string => Boolean(u))
    .slice(0, 6);

  return NextResponse.json({ thumbnails, products });
}
