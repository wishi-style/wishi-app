"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  ExternalLinkIcon,
  HeartIcon,
  ShoppingBagIcon,
  XIcon,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ProductVariant = {
  size: string;
  color: string;
  color_family: string;
  in_stock: boolean;
};

export type ProductListing = {
  listing_id: string;
  merchant_id: string;
  merchant_name: string;
  title: string;
  product_url: string;
  affiliate_url: string;
  primary_image_url: string;
  base_price: number;
  sale_price: number;
  in_stock: boolean;
  variants: ProductVariant[];
};

export type ProductDoc = {
  id: string;
  canonical_name: string;
  brand_name: string;
  category_id: string;
  gender: string;
  primary_image_url: string | null;
  image_urls: string[];
  available_sizes: string[];
  available_colors: string[];
  min_price: number;
  max_price: number;
  in_stock: boolean;
  listings: ProductListing[];
};

export interface ProductDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** inventoryProductId — used for all API calls */
  productId: string | null;
  /**
   * Active session that the "Add to Bag" button should associate with. When
   * null or omitted, the Add-to-Bag button is hidden (non-session surfaces
   * like the /feed page fall through to the retailer link).
   */
  sessionId?: string | null;
  /**
   * Whether the product is merchandised direct-sale. When false, hide the
   * Add to Bag CTA and only show Shop at Retailer. Consumers that don't
   * know can pass `undefined` and we hide on failure.
   */
  isDirectSale?: boolean;
  /** Starting payload from the caller — we still hydrate fresh data on open. */
  seed?: Partial<ProductDoc>;
  /** Called after a successful affiliate click-through. */
  onAffiliateClick?: (listingId: string, retailer: string) => void;
}

type SimilarItem = {
  id: string;
  canonical_name: string;
  brand_name: string;
  primary_image_url: string | null;
  min_price: number;
};

function formatPrice(cents: number): string {
  // Inventory service returns dollars (not cents) for min/max/base prices.
  return `$${Math.round(cents)}`;
}

/**
 * Product detail with size/color selectors, Add-to-Bag (direct-sale) + Shop
 * at Retailer (affiliate) tracks, and a Similar Items carousel sourced from
 * the phase-10 `/api/ai/similar-items` stub (swapped for real vector search
 * when Phase 7 ships).
 */
export function ProductDetailDialog({
  open,
  onOpenChange,
  productId,
  sessionId,
  isDirectSale,
  seed,
  onAffiliateClick,
}: ProductDetailDialogProps) {
  const [product, setProduct] = React.useState<ProductDoc | null>(
    seed && seed.id ? (seed as ProductDoc) : null,
  );
  const [loading, setLoading] = React.useState(false);
  const [size, setSize] = React.useState<string | null>(null);
  const [color, setColor] = React.useState<string | null>(null);
  const [addingToBag, setAddingToBag] = React.useState(false);
  const [favorited, setFavorited] = React.useState(false);
  const [similar, setSimilar] = React.useState<SimilarItem[] | null>(null);

  React.useEffect(() => {
    if (!open || !productId) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/products/${productId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ProductDoc | null) => {
        if (cancelled) return;
        if (data) {
          setProduct(data);
          setSize(data.available_sizes?.[0] ?? null);
          setColor(data.available_colors?.[0] ?? null);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, productId]);

  React.useEffect(() => {
    if (!open || !productId) return;
    let cancelled = false;
    fetch(`/api/ai/similar-items?productId=${productId}&limit=6`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data: { results?: SimilarItem[] }) => {
        if (cancelled) return;
        setSimilar(data.results ?? []);
      })
      .catch(() => {
        if (!cancelled) setSimilar([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, productId]);

  const addToBag = async () => {
    if (!productId || !sessionId) return;
    setAddingToBag(true);
    try {
      const res = await fetch(`/api/cart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryProductId: productId,
          sessionId,
          quantity: 1,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Couldn't add to bag");
      }
      toast.success("Added to your bag");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAddingToBag(false);
    }
  };

  const toggleFavorite = async () => {
    if (!productId) return;
    try {
      if (favorited) {
        const res = await fetch(
          `/api/favorites/items?inventoryProductId=${productId}`,
          { method: "DELETE" },
        );
        if (!res.ok) throw new Error("Couldn't remove from wishlist");
        setFavorited(false);
      } else {
        const res = await fetch(`/api/favorites/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inventoryProductId: productId }),
        });
        if (!res.ok) throw new Error("Couldn't save to wishlist");
        setFavorited(true);
      }
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const trackAffiliateClick = async (listing: ProductListing) => {
    try {
      await fetch("/api/affiliate/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryProductId: productId,
          inventoryListingId: listing.listing_id,
          retailer: listing.merchant_name,
          url: listing.affiliate_url ?? listing.product_url,
        }),
      });
    } catch {
      // Click tracking is best-effort; don't block the redirect.
    }
    onAffiliateClick?.(listing.listing_id, listing.merchant_name);
  };

  const hero = product?.primary_image_url ?? product?.image_urls?.[0] ?? null;
  const priceRange = product
    ? product.min_price === product.max_price
      ? formatPrice(product.min_price)
      : `${formatPrice(product.min_price)}–${formatPrice(product.max_price)}`
    : "";

  const listings = product?.listings ?? [];
  const canAddToBag = isDirectSale === true && !!sessionId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="text-xs uppercase tracking-widest text-dark-taupe">
            Product details
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto">
          <div className="grid md:grid-cols-2 gap-0">
            <div className="bg-muted">
              {hero ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={hero}
                  alt={product?.canonical_name ?? ""}
                  className="w-full aspect-square object-cover"
                />
              ) : (
                <div className="w-full aspect-square" />
              )}
            </div>
            <div className="p-6 space-y-5">
              {loading && !product ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : product ? (
                <>
                  <div>
                    <p className="text-xs uppercase tracking-widest text-dark-taupe">
                      {product.brand_name}
                    </p>
                    <h2 className="font-display text-2xl mt-1">
                      {product.canonical_name}
                    </h2>
                    <p className="mt-2 text-lg">{priceRange}</p>
                  </div>

                  {product.available_sizes.length > 0 ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
                        Size
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {product.available_sizes.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setSize(s)}
                            className={cn(
                              "rounded-full border px-3 py-1.5 text-xs transition-colors",
                              size === s
                                ? "border-foreground bg-foreground text-background"
                                : "border-border text-muted-foreground hover:border-foreground/50",
                            )}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {product.available_colors.length > 0 ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
                        Color
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {product.available_colors.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setColor(c)}
                            className={cn(
                              "rounded-full border px-3 py-1.5 text-xs transition-colors",
                              color === c
                                ? "border-foreground bg-foreground text-background"
                                : "border-border text-muted-foreground hover:border-foreground/50",
                            )}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex items-center gap-2 pt-2">
                    {canAddToBag ? (
                      <button
                        type="button"
                        onClick={addToBag}
                        disabled={addingToBag || !product.in_stock}
                        className="flex-1 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50 transition-colors"
                      >
                        <ShoppingBagIcon className="h-4 w-4" />
                        {addingToBag
                          ? "Adding…"
                          : product.in_stock
                            ? "Add to bag"
                            : "Out of stock"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={toggleFavorite}
                      aria-label={favorited ? "Remove from wishlist" : "Save to wishlist"}
                      className={cn(
                        "h-11 w-11 flex items-center justify-center rounded-full border transition-colors",
                        favorited
                          ? "border-foreground bg-foreground text-background"
                          : "border-border hover:border-foreground/50",
                      )}
                    >
                      <HeartIcon
                        className={cn(
                          "h-4 w-4",
                          favorited ? "fill-current" : "",
                        )}
                      />
                    </button>
                  </div>

                  {listings.length > 0 ? (
                    <div className="pt-2 space-y-2">
                      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        Shop at retailer
                      </p>
                      {listings.map((listing) => (
                        <a
                          key={listing.listing_id}
                          href={listing.affiliate_url ?? listing.product_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => trackAffiliateClick(listing)}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 hover:bg-muted/50 transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-sm">{listing.merchant_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {listing.sale_price &&
                              listing.sale_price < listing.base_price
                                ? `${formatPrice(listing.sale_price)} · was ${formatPrice(listing.base_price)}`
                                : formatPrice(listing.base_price)}
                            </p>
                          </div>
                          <ExternalLinkIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        </a>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  We couldn&apos;t load this product.
                </p>
              )}
            </div>
          </div>

          {similar && similar.length > 0 ? (
            <div className="px-6 py-6 border-t border-border">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
                Similar items
              </p>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {similar.map((s) => (
                  <div key={s.id} className="text-left">
                    {s.primary_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.primary_image_url}
                        alt={s.canonical_name}
                        className="w-full aspect-square object-cover rounded-md bg-muted"
                      />
                    ) : (
                      <div className="w-full aspect-square rounded-md bg-muted" />
                    )}
                    <p className="mt-1.5 text-[10px] uppercase tracking-wider text-dark-taupe truncate">
                      {s.brand_name}
                    </p>
                    <p className="text-xs truncate">{s.canonical_name}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
