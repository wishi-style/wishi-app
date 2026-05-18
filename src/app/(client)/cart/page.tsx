import { unauthorized } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { listCartItems } from "@/lib/cart/cart.service";
import { getProduct } from "@/lib/inventory/inventory-client";
import { CartClient, type WishiCartRow } from "./cart-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My bag — Wishi",
};

/**
 * MyBag / Cart — single-track Unicart. Every cart row is Wishi-fulfilled:
 * the human fulfiller buys each item from its retailer on the user's behalf
 * using the shipping info captured at /checkout. Per-item retailer
 * attribution is shown alongside each row so users know which retailer is
 * sourcing each piece (and will email their shipping confirmation).
 *
 * Affiliate "Shop at retailer" links live on the product cards themselves
 * (and the Favorites tab) — not in the cart, which is exclusively for
 * Wishi-fulfilled orders.
 */
export default async function CartPage() {
  const user = await getCurrentUser();
  if (!user) unauthorized();

  const cartItems = await listCartItems(user.id);

  const wishi: WishiCartRow[] = (
    await Promise.all(
      cartItems.map(
        async (
          item: (typeof cartItems)[number],
        ): Promise<WishiCartRow | null> => {
          const product = await getProduct(item.inventoryProductId);
          if (!product) return null;
          const listing = product.listings?.[0];
          const priceInCents = Math.round((product.min_price ?? 0) * 100);
          return {
            cartItemId: item.id,
            quantity: item.quantity,
            brand: product.brand_name,
            name: product.canonical_name,
            imageUrl: product.primary_image_url,
            retailerName: listing?.merchant_name ?? null,
            priceInCents,
            totalInCents: priceInCents * item.quantity,
          };
        },
      ),
    )
  ).filter((r): r is WishiCartRow => r != null);

  const nothing = wishi.length === 0;

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-6 md:px-10 py-10 md:py-16">
        <header className="mb-10 text-center">
          <h1 className="font-display text-4xl md:text-5xl mb-2">My Bag</h1>
          <p className="font-body text-sm text-muted-foreground tracking-wide">
            We shop on your behalf from each retailer
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
          <CartClient wishi={wishi} />
        )}
      </div>
    </div>
  );
}
