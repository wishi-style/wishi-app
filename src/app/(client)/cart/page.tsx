import { unauthorized } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { listCartItems } from "@/lib/cart/cart.service";
import { listFavoriteItems } from "@/lib/boards/favorite.service";
import { getProduct } from "@/lib/inventory/inventory-client";
import { getMerchandised } from "@/lib/products/merchandised-product.service";
import { CartRemoveButton } from "./cart-remove-button";
import { RetailerClickButton } from "./retailer-click";
import { CheckoutButton } from "./checkout-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My bag — Wishi",
};

type WishiRow = {
  cartItemId: string;
  inventoryProductId: string;
  sessionId: string | null;
  quantity: number;
  product: {
    name: string;
    brand: string;
    imageUrl: string | null;
    priceInCents: number;
    currency: string;
  } | null;
};

type RetailerRow = {
  favoriteItemId: string;
  inventoryProductId: string | null;
  url: string;
  retailer: string;
  name: string;
  brand: string;
  imageUrl: string | null;
  priceInCents: number | null;
};

/**
 * MyBag / Cart — two-track. Wishi items (direct-sale, Stripe Checkout via
 * POST /api/payments/checkout) on top; "Purchase via retailer" below for
 * items the user has favorited that aren't fulfilled by Wishi. Each
 * retailer row fires POST /api/affiliate/click before opening the retailer
 * link so commission ingest can later match the purchase back.
 */
export default async function CartPage() {
  const user = await getCurrentUser();
  if (!user) unauthorized();

  const [cartItems, favoriteItems] = await Promise.all([
    listCartItems(user.id),
    listFavoriteItems(user.id),
  ]);

  const wishi: WishiRow[] = await Promise.all(
    cartItems.map(async (item: (typeof cartItems)[number]) => {
      const product = await getProduct(item.inventoryProductId);
      return {
        cartItemId: item.id,
        inventoryProductId: item.inventoryProductId,
        sessionId: item.sessionId,
        quantity: item.quantity,
        product: product
          ? {
              name: product.canonical_name,
              brand: product.brand_name,
              imageUrl: product.primary_image_url,
              priceInCents: Math.round((product.min_price ?? 0) * 100),
              currency: product.currency ?? "USD",
            }
          : null,
      };
    }),
  );

  const inventoryFavIds = favoriteItems
    .map((f: (typeof favoriteItems)[number]) => f.inventoryProductId)
    .filter((id: string | null): id is string => !!id);
  const merchandisedMap = await getMerchandised(inventoryFavIds);

  const retailer: RetailerRow[] = (
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
            name: product.canonical_name,
            brand: product.brand_name,
            imageUrl: product.primary_image_url,
            priceInCents:
              typeof product.min_price === "number"
                ? Math.round(product.min_price * 100)
                : null,
          } satisfies RetailerRow;
        }
        if (fav.webUrl) {
          return {
            favoriteItemId: fav.id,
            inventoryProductId: null,
            url: fav.webUrl,
            retailer: fav.webItemBrand ?? "Retailer",
            name: fav.webItemTitle ?? fav.webUrl,
            brand: fav.webItemBrand ?? "",
            imageUrl: fav.webItemImageUrl ?? null,
            priceInCents: fav.webItemPriceInCents ?? null,
          } satisfies RetailerRow;
        }
        return null;
      }),
    )
  ).filter((r: RetailerRow | null): r is RetailerRow => r != null);

  const subtotalCents = wishi.reduce(
    (acc, r) => acc + (r.product?.priceInCents ?? 0) * r.quantity,
    0,
  );
  const subtotal = formatDollars(subtotalCents);
  const wishiItemCount = wishi.length;

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
            <h3 className="font-display text-xl mb-2">Let&apos;s fill up your cart</h3>
            <p className="text-muted-foreground font-body text-sm">
              Browse your curated pieces and add your favorites.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-10 lg:flex-row">
            <div className="min-w-0 flex-1">
              {wishi.length > 0 ? (
                <section className="mb-10">
                  <div className="mb-4 border-b border-border pb-3">
                    <h2 className="font-display text-lg">
                      Select items for single checkout via Wishi
                    </h2>
                  </div>
                  <ul className="divide-y divide-border">
                    {wishi.map((row) => (
                      <li
                        key={row.cartItemId}
                        className="group flex items-start gap-5 py-6"
                      >
                        <div className="relative h-32 w-24 flex-shrink-0 overflow-hidden rounded-md bg-muted md:h-36 md:w-28">
                          {row.product?.imageUrl ? (
                            <Image
                              src={row.product.imageUrl}
                              alt={row.product.name}
                              fill
                              sizes="112px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                              ?
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-body text-base font-semibold text-foreground">
                            {row.product?.brand ?? ""}
                          </p>
                          <p className="mt-0.5 font-body text-sm text-muted-foreground">
                            {row.product?.name ?? "Unknown item"}
                          </p>
                          <p className="mt-2 font-body text-sm font-medium">
                            {row.product
                              ? formatDollars(
                                  row.product.priceInCents * row.quantity,
                                )
                              : "—"}
                          </p>
                        </div>
                        <CartRemoveButton cartItemId={row.cartItemId} />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {retailer.length > 0 ? (
                <section>
                  <div className="mb-4 border-b border-border pb-3">
                    <h2 className="font-display text-lg">Purchase via retailer</h2>
                    <p className="mt-1 font-body text-xs text-muted-foreground">
                      These items are available through external retailers
                    </p>
                  </div>
                  <ul className="divide-y divide-border">
                    {retailer.map((row) => (
                      <li
                        key={row.favoriteItemId}
                        className="group flex items-start gap-5 py-6"
                      >
                        <div className="relative ml-10 h-32 w-24 flex-shrink-0 overflow-hidden rounded-md bg-muted md:h-36 md:w-28">
                          {row.imageUrl ? (
                            <Image
                              src={row.imageUrl}
                              alt={row.name}
                              fill
                              sizes="112px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                              ?
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          {row.brand ? (
                            <p className="font-body text-base font-semibold text-foreground">
                              {row.brand}
                            </p>
                          ) : null}
                          <p className="mt-0.5 font-body text-sm text-muted-foreground">
                            {row.name}
                          </p>
                          {row.priceInCents != null ? (
                            <p className="mt-2 font-body text-sm font-medium">
                              {formatDollars(row.priceInCents)}
                            </p>
                          ) : null}
                          <RetailerClickButton
                            inventoryProductId={row.inventoryProductId}
                            retailer={row.retailer}
                            url={row.url}
                            className="mt-3 inline-flex items-center gap-1.5 border border-foreground px-4 py-1.5 font-body text-xs transition-colors hover:bg-foreground hover:text-background"
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>

            <aside className="lg:w-80 lg:shrink-0">
              <div className="sticky top-24 space-y-4 rounded-xl border border-border bg-secondary/30 p-6">
                <h2 className="text-center font-display text-xl">Order Summary</h2>
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between font-body text-sm">
                    <span className="text-muted-foreground">
                      Subtotal ({wishiItemCount} {wishiItemCount === 1 ? "item" : "items"})
                    </span>
                    <span>{subtotal}</span>
                  </div>
                  <div className="flex items-baseline justify-between font-body text-sm">
                    <span className="text-muted-foreground">Tax</span>
                    <span>At Checkout</span>
                  </div>
                  <div className="flex items-baseline justify-between font-body text-sm">
                    <span className="text-muted-foreground">Shipping</span>
                    <span>Free</span>
                  </div>
                </div>
                <div className="border-t border-border pt-4">
                  <div className="flex items-baseline justify-between">
                    <span className="font-body text-sm">Estimated Total</span>
                    <span className="font-display text-xl font-semibold">
                      {subtotal}
                    </span>
                  </div>
                </div>
                {wishi.length > 0 ? (
                  <CheckoutButton
                    cartItemIds={wishi.map((r) => r.cartItemId)}
                  />
                ) : (
                  <p className="font-body text-xs text-muted-foreground">
                    Add a Wishi-fulfilled item to your bag to check out here.
                    Retailer items above check out on each retailer&apos;s site.
                  </p>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

function formatDollars(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
