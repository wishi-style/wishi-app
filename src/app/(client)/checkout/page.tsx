import Link from "next/link";
import { unauthorized } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getCartItemsByIds } from "@/lib/cart/cart.service";
import { getProduct } from "@/lib/inventory/inventory-client";
import { getMerchandised } from "@/lib/products/merchandised-product.service";
import { CheckoutClient, type CheckoutItem } from "./checkout-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout — Wishi",
};

/**
 * Native /checkout — Loveable contract (`smart-spark-craft/src/pages/Checkout.tsx`).
 * Replaces the prior `/cart` → Stripe Hosted redirect. The user stays on
 * wishi.com through shipping → payment → confirmation; cards are collected
 * via Stripe Elements (`<PaymentElement>`), which keeps PCI scope at SAQ A
 * (Stripe still hosts the card iframes).
 *
 * Tax + shipping are computed server-side via Stripe Tax API
 * (`/api/payments/direct-sale/calculate-tax`) once the user enters a
 * shipping address; the PaymentIntent is created at "Pay" time
 * (`/api/payments/direct-sale/intent`) and committed via the
 * `payment_intent.succeeded` webhook handler that flips
 * `Order(PENDING)` → `ORDERED`.
 */
export default async function CheckoutPage(props: {
  searchParams: Promise<{ items?: string }>;
}) {
  const params = await props.searchParams;
  const user = await getCurrentUser();
  if (!user) unauthorized();

  const cartItemIds = (params.items ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (cartItemIds.length === 0) {
    return <EmptyState reason="empty" />;
  }

  // Validate items belong to user, are still direct-sale, and have stock —
  // the same checks `resolveLineItems` runs server-side before Stripe Tax
  // is called, but doing them here too means we can show a tidy empty
  // state instead of a generic error the user can't act on.
  let cartRows: Awaited<ReturnType<typeof getCartItemsByIds>> = [];
  try {
    cartRows = await getCartItemsByIds(user.id, cartItemIds);
  } catch {
    return <EmptyState reason="invalid" />;
  }
  if (cartRows.length === 0) return <EmptyState reason="invalid" />;
  if (cartRows.length !== cartItemIds.length) {
    return <EmptyState reason="invalid" />;
  }
  // resolveLineItems (called by /calculate-tax + /intent later) requires a
  // single session. Catch the mismatch here so the user gets the empty
  // state up front instead of an ugly error mid-form.
  if (new Set(cartRows.map((r) => r.sessionId)).size !== 1) {
    return <EmptyState reason="invalid" />;
  }

  const inventoryIds = [...new Set(cartRows.map((r) => r.inventoryProductId))];
  const merchandisedMap = await getMerchandised(inventoryIds);

  // Strict resolution — every cart row must map to an in-stock direct-sale
  // listing or we render the empty state. Anything looser would let the
  // checkout render fewer items than the cart, or with an out-of-stock
  // listing that resolveLineItems will then refuse to charge.
  const items: CheckoutItem[] = [];
  for (const row of cartRows) {
    const merch = merchandisedMap.get(row.inventoryProductId);
    if (!merch?.isDirectSale) {
      return <EmptyState reason="not-direct-sale" />;
    }
    const product = await getProduct(row.inventoryProductId);
    if (!product) {
      return <EmptyState reason="invalid" />;
    }
    const listing = product.listings.find((l) => l.in_stock);
    if (!listing) {
      return <EmptyState reason="invalid" />;
    }
    const priceDollars =
      listing.sale_price && listing.sale_price > 0
        ? listing.sale_price
        : listing.base_price;
    items.push({
      cartItemId: row.id,
      inventoryProductId: row.inventoryProductId,
      title: listing.title || product.canonical_name,
      brand: product.brand_name ?? "",
      imageUrl: listing.primary_image_url || product.primary_image_url || null,
      unitAmountInCents: Math.round(priceDollars * 100),
      quantity: row.quantity,
    });
  }

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

  return (
    <div className="min-h-screen bg-background">
      <CheckoutClient
        items={items}
        publishableKey={publishableKey}
        defaultEmail={user.email ?? ""}
      />
    </div>
  );
}

function EmptyState({ reason }: { reason: "empty" | "invalid" | "not-direct-sale" }) {
  const messages = {
    empty: "Your cart is empty.",
    invalid: "Some of the items in your cart are no longer available.",
    "not-direct-sale": "One or more items are no longer available for direct sale.",
  } as const;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="font-display text-3xl mb-4">No items to checkout</h1>
        <p className="font-body text-sm text-muted-foreground mb-8">
          {messages[reason]}
        </p>
        <Link
          href="/cart"
          className="font-body text-sm underline underline-offset-4 text-foreground"
        >
          Return to Bag
        </Link>
      </div>
    </div>
  );
}
