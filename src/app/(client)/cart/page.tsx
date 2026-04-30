import { unauthorized } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { listCartItems } from "@/lib/cart/cart.service";
import { listFavoriteItems } from "@/lib/boards/favorite.service";
import { getProduct } from "@/lib/inventory/inventory-client";
import { getMerchandised } from "@/lib/products/merchandised-product.service";
import {
  CartClient,
  type WishiCartRow,
  type RetailerCartRow,
} from "./cart-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My bag — Wishi",
};

/**
 * MyBag / Cart — two-track. Wishi items (direct-sale, Stripe Checkout via
 * /checkout) on top; "Purchase via retailer" below for items the user has
 * favorited that aren't fulfilled by Wishi. Each retailer row fires
 * /api/affiliate/click before opening the retailer link so commission
 * ingest can later match the purchase back. Verbatim port of Loveable
 * MyBag.tsx — sort bar, per-item checkbox driving subtotal, sidebar
 * shows selection-based math, retailer-checkout footer note.
 */
export default async function CartPage() {
  const user = await getCurrentUser();
  if (!user) unauthorized();

  const [cartItems, favoriteItems] = await Promise.all([
    listCartItems(user.id),
    listFavoriteItems(user.id),
  ]);

  const wishi: WishiCartRow[] = (
    await Promise.all(
      cartItems.map(async (item: (typeof cartItems)[number]) => {
        const product = await getProduct(item.inventoryProductId);
        if (!product) return null;
        const priceInCents = Math.round((product.min_price ?? 0) * 100);
        return {
          cartItemId: item.id,
          quantity: item.quantity,
          brand: product.brand_name,
          name: product.canonical_name,
          imageUrl: product.primary_image_url,
          priceInCents,
          totalInCents: priceInCents * item.quantity,
        } satisfies WishiCartRow;
      }),
    )
  ).filter((r): r is WishiCartRow => r != null);

  const inventoryFavIds = favoriteItems
    .map((f: (typeof favoriteItems)[number]) => f.inventoryProductId)
    .filter((id: string | null): id is string => !!id);
  const merchandisedMap = await getMerchandised(inventoryFavIds);

  const retailer: RetailerCartRow[] = (
    await Promise.all(
      favoriteItems.map(async (fav: (typeof favoriteItems)[number]) => {
        if (fav.inventoryProductId) {
          const merch = merchandisedMap.get(fav.inventoryProductId);
          if (merch?.isDirectSale) return null;
          const product = await getProduct(fav.inventoryProductId);
          if (!product) return null;
          const listing = product.listings?.[0];
          const url = listing?.affiliate_url ?? listing?.product_url;
          if (!url) return null;
          return {
            favoriteItemId: fav.id,
            inventoryProductId: fav.inventoryProductId,
            url,
            retailer: listing?.merchant_name ?? "Retailer",
            brand: product.brand_name,
            name: product.canonical_name,
            imageUrl: product.primary_image_url,
            priceInCents:
              typeof product.min_price === "number"
                ? Math.round(product.min_price * 100)
                : null,
          } satisfies RetailerCartRow;
        }
        if (fav.webUrl) {
          return {
            favoriteItemId: fav.id,
            inventoryProductId: null,
            url: fav.webUrl,
            retailer: fav.webItemBrand ?? "Retailer",
            brand: fav.webItemBrand ?? "",
            name: fav.webItemTitle ?? fav.webUrl,
            imageUrl: fav.webItemImageUrl ?? null,
            priceInCents: fav.webItemPriceInCents ?? null,
          } satisfies RetailerCartRow;
        }
        return null;
      }),
    )
  ).filter((r): r is RetailerCartRow => r != null);

  const nothing = wishi.length === 0 && retailer.length === 0;

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-6 md:px-10 py-10 md:py-16">
        <header className="mb-10 text-center">
          <h1 className="font-display text-4xl md:text-5xl mb-2">My Bag</h1>
          <p className="font-body text-sm text-muted-foreground tracking-wide">
            Always Free Shipping
          </p>
        </header>

        {nothing ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <h3 className="font-display text-xl mb-2">
              Let&apos;s fill up your cart
            </h3>
            <p className="text-muted-foreground font-body text-sm mb-6">
              Browse your curated pieces and add your favorites.
            </p>
          </div>
        ) : (
          <CartClient wishi={wishi} retailer={retailer} />
        )}
      </div>
    </div>
  );
}
