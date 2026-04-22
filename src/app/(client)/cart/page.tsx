import { unauthorized } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { listCartItems } from "@/lib/cart/cart.service";
import { getProduct } from "@/lib/inventory/inventory-client";
import { PillButton } from "@/components/primitives/pill-button";
import { CartRemoveButton } from "./cart-remove-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My bag — Wishi",
};

type CartRow = {
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
    merchantName: string | null;
    merchantUrl: string | null;
  } | null;
};

export default async function CartPage() {
  const user = await getCurrentUser();
  if (!user) unauthorized();

  const cartItems = await listCartItems(user.id);

  const rows: CartRow[] = await Promise.all(
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
              merchantName: null,
              merchantUrl: null,
            }
          : null,
      };
    }),
  );

  const subtotalCents = rows.reduce(
    (acc, r) => acc + (r.product?.priceInCents ?? 0) * r.quantity,
    0,
  );
  const subtotal = formatDollars(subtotalCents);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 md:px-10 py-12 md:py-16">
        <header className="mb-10">
          <h1 className="font-display text-3xl md:text-4xl">My Bag</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {rows.length === 0
              ? "Nothing here yet — your stylist's picks will show up in the board, ready to add."
              : `${rows.length} item${rows.length === 1 ? "" : "s"} saved for checkout.`}
          </p>
        </header>

        {rows.length === 0 ? (
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
            <ul className="space-y-4">
              {rows.map((row) => (
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
                        ? formatDollars(row.product.priceInCents * row.quantity)
                        : "—"}
                    </p>
                    <CartRemoveButton cartItemId={row.cartItemId} />
                  </div>
                </li>
              ))}
            </ul>

            <aside className="h-fit rounded-2xl border border-border bg-card p-6 space-y-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Order summary
              </p>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Subtotal</span>
                <span className="font-display text-xl">{subtotal}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Shipping and tax calculated at checkout.
              </p>
              <form action="/api/payments/checkout" method="post">
                {rows.map((r) => (
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
              <p className="text-xs text-muted-foreground">
                Items bought through Wishi are fulfilled by us. Items linked to a
                retailer go to that retailer&apos;s checkout from the product
                detail view.
              </p>
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
