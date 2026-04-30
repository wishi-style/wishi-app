"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { CheckIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { RetailerClickButton } from "./retailer-click";
import { CheckoutButton } from "./checkout-button";

type SortOption = "newest" | "price_high" | "price_low" | "retailer";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price_high", label: "Price: High to Low" },
  { value: "price_low", label: "Price: Low to High" },
  { value: "retailer", label: "Retailer" },
];

export interface WishiCartRow {
  cartItemId: string;
  quantity: number;
  brand: string;
  name: string;
  imageUrl: string | null;
  priceInCents: number;
  totalInCents: number;
}

export interface RetailerCartRow {
  favoriteItemId: string;
  inventoryProductId: string | null;
  url: string;
  retailer: string;
  brand: string;
  name: string;
  imageUrl: string | null;
  priceInCents: number | null;
}

interface Props {
  wishi: WishiCartRow[];
  retailer: RetailerCartRow[];
}

function formatDollars(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function CartClient({ wishi, retailer }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [removingId, setRemovingId] = useState<string | null>(null);

  function toggleSelect(cartItemId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cartItemId)) next.delete(cartItemId);
      else next.add(cartItemId);
      return next;
    });
  }

  async function removeWishi(cartItemId: string) {
    if (!window.confirm("Remove this item from your bag?")) return;
    setRemovingId(cartItemId);
    try {
      const res = await fetch(`/api/cart/${cartItemId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(cartItemId);
        return next;
      });
      router.refresh();
    } catch {
      toast.error("Couldn't remove that item. Try again.");
    } finally {
      setRemovingId(null);
    }
  }

  async function removeRetailer(row: RetailerCartRow) {
    if (!window.confirm("Remove this favorite?")) return;
    setRemovingId(row.favoriteItemId);
    const params = row.inventoryProductId
      ? `inventoryProductId=${encodeURIComponent(row.inventoryProductId)}`
      : `webUrl=${encodeURIComponent(row.url)}`;
    try {
      const res = await fetch(`/api/favorites/items?${params}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");
      router.refresh();
    } catch {
      toast.error("Couldn't remove that item. Try again.");
    } finally {
      setRemovingId(null);
    }
  }

  function sortRows<T extends { priceInCents: number | null; brand: string }>(
    rows: T[],
  ): T[] {
    const copy = [...rows];
    switch (sortBy) {
      case "price_high":
        return copy.sort(
          (a, b) => (b.priceInCents ?? 0) - (a.priceInCents ?? 0),
        );
      case "price_low":
        return copy.sort(
          (a, b) => (a.priceInCents ?? 0) - (b.priceInCents ?? 0),
        );
      case "retailer":
        return copy.sort((a, b) => (a.brand || "").localeCompare(b.brand || ""));
      default:
        return copy;
    }
  }

  const selectedRows = useMemo(
    () => wishi.filter((r) => selected.has(r.cartItemId)),
    [wishi, selected],
  );
  const subtotalCents = selectedRows.reduce(
    (acc, r) => acc + r.totalInCents,
    0,
  );
  const subtotal = formatDollars(subtotalCents);
  const selectedItemCount = selectedRows.length;

  const sortedWishi = useMemo(() => sortRows(wishi), [wishi, sortBy]);
  const sortedRetailer = useMemo(
    () => sortRows(retailer),
    [retailer, sortBy],
  );

  return (
    <>
      {/* Sort bar */}
      <div className="flex items-center justify-center gap-6 mb-10 font-body text-sm">
        <span className="text-muted-foreground">Sort by:</span>
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setSortBy(opt.value)}
            className={cn(
              "transition-colors",
              sortBy === opt.value
                ? "text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-10">
        <div className="flex-1 min-w-0">
          {/* Wishi checkout section */}
          {sortedWishi.length > 0 && (
            <section className="mb-10">
              <div className="mb-4 pb-3 border-b border-border">
                <h2 className="font-display text-lg">
                  Select items for single checkout via Wishi
                </h2>
              </div>
              <div className="divide-y divide-border">
                {sortedWishi.map((row) => {
                  const isSelected = selected.has(row.cartItemId);
                  return (
                    <div
                      key={row.cartItemId}
                      className="py-6 flex gap-5 group"
                    >
                      <div className="flex items-start pt-2">
                        <button
                          type="button"
                          onClick={() => toggleSelect(row.cartItemId)}
                          className={cn(
                            "h-5 w-5 rounded border-2 flex items-center justify-center transition-colors shrink-0",
                            isSelected
                              ? "bg-foreground border-foreground"
                              : "border-border hover:border-foreground",
                          )}
                          aria-pressed={isSelected}
                          aria-label={
                            isSelected
                              ? "Deselect for checkout"
                              : "Select for checkout"
                          }
                        >
                          {isSelected && (
                            <CheckIcon className="h-3 w-3 text-background" />
                          )}
                        </button>
                      </div>

                      <div className="relative h-32 w-24 md:h-36 md:w-28 shrink-0 overflow-hidden rounded-md bg-muted">
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

                      <div className="flex flex-1 flex-col min-w-0">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-body text-base font-semibold text-foreground">
                              {row.brand}
                            </p>
                            <p className="font-body text-sm text-muted-foreground mt-0.5">
                              {row.name}
                            </p>
                            <p className="font-body text-sm font-medium text-foreground mt-2">
                              {formatDollars(row.totalInCents)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeWishi(row.cartItemId)}
                            disabled={removingId === row.cartItemId}
                            aria-label="Remove from bag"
                            className="text-muted-foreground hover:text-foreground transition-colors p-1 disabled:opacity-40"
                          >
                            <XIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Retailer section */}
          {sortedRetailer.length > 0 && (
            <section>
              <div className="mb-4 pb-3 border-b border-border">
                <h2 className="font-display text-lg">Purchase via retailer</h2>
                <p className="font-body text-xs text-muted-foreground mt-1">
                  These items are available through external retailers
                </p>
              </div>
              <div className="divide-y divide-border">
                {sortedRetailer.map((row) => (
                  <div
                    key={row.favoriteItemId}
                    className="py-6 flex gap-5 group"
                  >
                    <div className="relative h-32 w-24 md:h-36 md:w-28 shrink-0 overflow-hidden rounded-md bg-muted ml-10">
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
                    <div className="flex flex-1 flex-col min-w-0">
                      <div className="flex justify-between items-start">
                        <div>
                          {row.brand && (
                            <p className="font-body text-base font-semibold text-foreground">
                              {row.brand}
                            </p>
                          )}
                          <p className="font-body text-sm text-muted-foreground mt-0.5">
                            {row.name}
                          </p>
                          {row.priceInCents != null && (
                            <p className="font-body text-sm font-medium text-foreground mt-2">
                              {formatDollars(row.priceInCents)}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeRetailer(row)}
                          disabled={removingId === row.favoriteItemId}
                          aria-label="Remove from bag"
                          className="text-muted-foreground hover:text-foreground transition-colors p-1 disabled:opacity-40"
                        >
                          <XIcon className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-3">
                        <RetailerClickButton
                          inventoryProductId={row.inventoryProductId}
                          retailer={row.retailer}
                          url={row.url}
                          className="inline-flex items-center gap-1.5 font-body text-sm font-medium text-foreground border border-foreground rounded-md px-4 py-1.5 hover:bg-foreground hover:text-background transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Order Summary sidebar */}
        <div className="lg:w-80 shrink-0">
          <div className="sticky top-24 rounded-xl bg-secondary/30 border border-border p-6">
            <h2 className="font-display text-xl text-center mb-6">
              Order Summary
            </h2>

            <div className="space-y-3 font-body text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Subtotal ({selectedItemCount}{" "}
                  {selectedItemCount === 1 ? "item" : "items"}):
                </span>
                <span className="text-foreground font-medium">{subtotal}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="text-foreground">At Checkout</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span className="text-foreground">Free</span>
              </div>
            </div>

            <div className="border-t border-border mt-4 pt-4">
              <div className="flex justify-between font-body">
                <span className="text-sm text-foreground">
                  Estimated Total:
                </span>
                <span className="text-xl font-semibold text-foreground">
                  {subtotal}
                </span>
              </div>
            </div>

            <div className="mt-6">
              <CheckoutButton
                cartItemIds={selectedRows.map((r) => r.cartItemId)}
              />
            </div>

            {sortedRetailer.length > 0 && (
              <p className="mt-3 text-center font-body text-xs text-muted-foreground">
                {sortedRetailer.length}{" "}
                {sortedRetailer.length === 1
                  ? "item requires"
                  : "items require"}{" "}
                separate retailer checkout
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
