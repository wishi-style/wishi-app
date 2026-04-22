import { unauthorized } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { listCartItems } from "@/lib/cart/cart.service";
import { listFavoriteItems } from "@/lib/boards/favorite.service";
import { getProduct } from "@/lib/inventory/inventory-client";
import { getMerchandised } from "@/lib/products/merchandised-product.service";
import { PillButton } from "@/components/primitives/pill-button";
import { CartRemoveButton } from "./cart-remove-button";
import { RetailerClickButton } from "./retailer-click";

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
  /** The URL to shop at the retailer — either a listing affiliate_url or the favorited webUrl */
  url: string;
  retailer: string;
  name: string;
  brand: string;
  imageUrl: string | null;
  priceInCents: number | null;
};

/**
 * MyBag / Cart — two-track. Wishi items (direct-sale, Stripe Checkout via
 * POST /api/payments/checkout) on top; "Purchase at retailer" below for
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

  // Retailer track = favorited items that are either (a) inventory products
  // NOT marked direct-sale, or (b) free-text webUrl favorites. Wishi-fulfilled
  // inventory items hide here since they already live in the Wishi track.
  const inventoryFavIds = favoriteItems
    .map((f: (typeof favoriteItems)[number]) => f.inventoryProductId)
    .filter((id: string | null): id is string => !!id);
  const merchandisedMap = await getMerchandised(inventoryFavIds);

  const retailer: RetailerRow[] = (
    await Promise.all(
      favoriteItems.map(async (fav: (typeof favoriteItems)[number]) => {
        if (fav.inventoryProductId) {
          const merch = merchandisedMap.get(fav.inventoryProductId);
          if (merch?.isDirectSale) return null; // already in Wishi track
          const product = await getProduct(fav.inventoryProductId);
          if (!product) return null;
          const listing = product.listings?.[0];
          const url =
            listing?.affiliate_url ?? listing?.product_url ?? product.image_urls?.[0];
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

  const nothing = wishi.length === 0 && retailer.length === 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 md:px-10 py-12 md:py-16">
        <header className="mb-10">
          <h1 className="font-display text-3xl md:text-4xl">My Bag</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {nothing
              ? "Nothing here yet — your stylist's picks will show up in the board, ready to add."
              : `${wishi.length + retailer.length} item${wishi.length + retailer.length === 1 ? "" : "s"} saved.`}
          </p>
        </header>

        {nothing ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center">
            <p className="text-sm text-muted-foreground">
              You don&apos;t have any items in your bag yet.
            </p>
            <PillButton
              href="/sessions"
              variant="solid"
              size="md"
              className="mt-5"
            >
              Go to my sessions
            </PillButton>
          </div>
        ) : (
          <div className="grid gap-10 lg:grid-cols-[1fr,320px]">
            <div className="space-y-10">
              {wishi.length > 0 ? (
                <section>
                  <div className="mb-3 flex items-baseline justify-between">
                    <h2 className="font-display text-lg">Shop with Wishi</h2>
                    <p className="text-xs text-muted-foreground">
                      Fulfilled by Wishi
                    </p>
                  </div>
                  <ul className="space-y-4">
                    {wishi.map((row) => (
                      <li
                        key={row.cartItemId}
                        className="flex items-start gap-4 rounded-2xl border border-border bg-card p-4"
                      >
                        <div className="relative h-24 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
                          {row.product?.imageUrl ? (
                            <Image
                              src={row.product.imageUrl}
                              alt={row.product.name}
                              fill
                              sizes="80px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                              ?
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs uppercase tracking-widest text-dark-taupe">
                            {row.product?.brand ?? ""}
                          </p>
                          <p className="font-display text-base truncate">
                            {row.product?.name ?? "Unknown item"}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Qty {row.quantity}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <p className="font-display text-base">
                            {row.product
                              ? formatDollars(
                                  row.product.priceInCents * row.quantity,
                                )
                              : "—"}
                          </p>
                          <CartRemoveButton cartItemId={row.cartItemId} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {retailer.length > 0 ? (
                <section>
                  <div className="mb-3 flex items-baseline justify-between">
                    <h2 className="font-display text-lg">
                      Purchase at retailer
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Each retailer ships + handles returns directly
                    </p>
                  </div>
                  <ul className="space-y-4">
                    {retailer.map((row) => (
                      <li
                        key={row.favoriteItemId}
                        className="flex items-start gap-4 rounded-2xl border border-border bg-card p-4"
                      >
                        <div className="relative h-24 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
                          {row.imageUrl ? (
                            <Image
                              src={row.imageUrl}
                              alt={row.name}
                              fill
                              sizes="80px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                              ?
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          {row.brand ? (
                            <p className="text-xs uppercase tracking-widest text-dark-taupe">
                              {row.brand}
                            </p>
                          ) : null}
                          <p className="font-display text-base truncate">
                            {row.name}
                          </p>
                          {row.priceInCents != null ? (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {formatDollars(row.priceInCents)}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <RetailerClickButton
                            inventoryProductId={row.inventoryProductId}
                            retailer={row.retailer}
                            url={row.url}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>

            <aside className="h-fit rounded-2xl border border-border bg-card p-6 space-y-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Wishi order summary
              </p>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Subtotal</span>
                <span className="font-display text-xl">{subtotal}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Shipping and tax calculated at checkout.
              </p>
              {wishi.length > 0 ? (
                <form action="/api/payments/checkout" method="post">
                  {wishi.map((r) => (
                    <input
                      key={r.cartItemId}
                      type="hidden"
                      name="cartItemId"
                      value={r.cartItemId}
                    />
                  ))}
                  <button
                    type="submit"
                    className="w-full inline-flex items-center justify-center rounded-full bg-foreground text-background h-12 text-sm font-medium hover:bg-foreground/90 transition-colors"
                  >
                    Proceed to Checkout
                  </button>
                </form>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Add a Wishi-fulfilled item to your bag to check out here.
                  Retailer items above check out on each retailer&apos;s site.
                </p>
              )}
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
