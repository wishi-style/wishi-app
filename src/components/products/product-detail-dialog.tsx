"use client";

import { useState } from "react";
import Image from "next/image";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { HeartIcon, ArrowLeftIcon, AlertTriangleIcon, CheckCircle2Icon, PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ProductItem } from "@/components/boards/styleboard";

const sizes = ["XXS", "XS", "S", "M", "L", "XL"];

export interface StylistClientContext {
  clientName: string;
  /** e.g. "M" or "8" — preferred size for this category */
  clientSize?: string;
  /** sizes the product is actually available in */
  availableSizes?: string[];
  /** numeric price of the product */
  productPrice?: number;
  /** budget range [min, max] for this category */
  budgetRange?: [number, number];
  /** display string for budget e.g. "$50–$100" */
  budgetLabel?: string;
  categoryLabel?: string;
}

interface ProductDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductItem | null;
  onAddToCart?: (productId: string) => void;
  /** When provided, dialog renders in stylist mode (client fit/budget checks, no buy buttons) */
  stylistContext?: StylistClientContext;
  addLabel?: string;
}

export function ProductDetailDialog({ open, onOpenChange, product, onAddToCart, stylistContext, addLabel }: ProductDetailDialogProps) {
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [wishlisted, setWishlisted] = useState(false);
  const isMobile = useIsMobile();

  if (!product) return null;

  const isStylist = !!stylistContext;

  // Stylist-mode checks
  const sizeAvailable = stylistContext?.clientSize && stylistContext.availableSizes
    ? stylistContext.availableSizes.map((s) => s.toLowerCase()).includes(stylistContext.clientSize.toLowerCase())
    : null;
  const overBudget = stylistContext?.productPrice != null && stylistContext.budgetRange
    ? stylistContext.productPrice > stylistContext.budgetRange[1]
    : false;
  const underBudget = stylistContext?.productPrice != null && stylistContext.budgetRange
    ? stylistContext.productPrice < stylistContext.budgetRange[0]
    : false;

  const renderStylistChecks = () => (
    <div className="space-y-3">
      {/* Client size check */}
      <div
        className={cn(
          "rounded-md border p-3 flex items-start gap-3",
          sizeAvailable === false
            ? "border-destructive/40 bg-destructive/5"
            : sizeAvailable === true
            ? "border-emerald-600/30 bg-emerald-50"
            : "border-border bg-muted/30"
        )}
      >
        {sizeAvailable === false ? (
          <AlertTriangleIcon className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        ) : sizeAvailable === true ? (
          <CheckCircle2Icon className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" />
        ) : (
          <AlertTriangleIcon className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="font-body text-sm font-semibold text-foreground">
              Client size{stylistContext?.categoryLabel ? ` (${stylistContext.categoryLabel})` : ""}:{" "}
              <span className="font-normal">{stylistContext?.clientSize ?? "—"}</span>
            </p>
            {sizeAvailable === false && (
              <span className="text-[10px] uppercase tracking-wide font-body font-semibold text-destructive bg-destructive/10 px-2 py-0.5 rounded">
                Not available
              </span>
            )}
            {sizeAvailable === true && (
              <span className="text-[10px] uppercase tracking-wide font-body font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                In stock
              </span>
            )}
          </div>
          <p className="font-body text-xs text-muted-foreground">
            Available: {stylistContext?.availableSizes?.join(", ") || "—"}
          </p>
        </div>
      </div>

      {/* Budget check */}
      <div
        className={cn(
          "rounded-md border p-3 flex items-start gap-3",
          overBudget
            ? "border-destructive/40 bg-destructive/5"
            : underBudget
            ? "border-border bg-muted/30"
            : "border-emerald-600/30 bg-emerald-50"
        )}
      >
        {overBudget ? (
          <AlertTriangleIcon className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        ) : (
          <CheckCircle2Icon className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="font-body text-sm font-semibold text-foreground">
              Client budget{stylistContext?.categoryLabel ? ` (${stylistContext.categoryLabel})` : ""}:{" "}
              <span className="font-normal">{stylistContext?.budgetLabel ?? "—"}</span>
            </p>
            {overBudget && (
              <span className="text-[10px] uppercase tracking-wide font-body font-semibold text-destructive bg-destructive/10 px-2 py-0.5 rounded">
                Over budget
              </span>
            )}
            {!overBudget && stylistContext?.productPrice != null && (
              <span className="text-[10px] uppercase tracking-wide font-body font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                In range
              </span>
            )}
          </div>
          <p className="font-body text-xs text-muted-foreground">
            Item price: {product.price}
          </p>
        </div>
      </div>
    </div>
  );

  const handleAdd = () => {
    onAddToCart?.(product.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!o) { setSelectedSize(null); setWishlisted(false); }
      onOpenChange(o);
    }}>
      <DialogContent
        className={cn(
          "p-0 gap-0 overflow-hidden",
          isMobile
            ? "fixed inset-0 w-full h-full max-w-none max-h-none rounded-none translate-x-0 translate-y-0 top-0 left-0 border-0"
            : "max-w-3xl"
        )}
      >
        {isMobile ? (
          /* ── Mobile ── */
          <div className="h-full overflow-y-auto bg-background">
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-background/90 backdrop-blur-sm border-b border-border">
              <button onClick={() => onOpenChange(false)} className="flex items-center gap-1 text-sm font-body text-foreground">
                <ArrowLeftIcon className="h-5 w-5" />
              </button>
              <button
                onClick={() => setWishlisted(!wishlisted)}
                className="h-9 w-9 rounded-full flex items-center justify-center"
              >
                <HeartIcon className={cn("h-5 w-5", wishlisted ? "fill-foreground text-foreground" : "text-foreground")} />
              </button>
            </div>

            <div className="w-full">
              <Image src={product.image} alt={product.brand} width={400} height={533} unoptimized className="w-full aspect-[3/4] object-cover" />
            </div>

            <div className="p-5 flex flex-col gap-5">
              <div>
                <p className="font-body text-sm text-muted-foreground mb-1">{product.brand}</p>
                <h2 className="font-display text-xl mb-1">{product.brand}</h2>
                <p className="font-display text-lg">{product.soldOut ? "Sold out" : product.price}</p>
              </div>

              {isStylist ? (
                <>
                  {renderStylistChecks()}
                  <button
                    onClick={handleAdd}
                    className="w-full rounded-lg bg-foreground text-background py-3.5 text-sm font-body font-medium hover:bg-foreground/90 transition-colors inline-flex items-center justify-center gap-2"
                  >
                    <PlusIcon className="h-4 w-4" />
                    {addLabel ?? "Add to canvas"}
                  </button>
                </>
              ) : (
                <>
                  {!product.soldOut && (
                    <div>
                      <p className="font-body text-sm font-medium text-foreground mb-3">Size:</p>
                      <div className="flex flex-wrap gap-2">
                        {sizes.map((size) => (
                          <button
                            key={size}
                            onClick={() => setSelectedSize(size)}
                            className={cn(
                              "h-11 min-w-[3.25rem] px-3 rounded-md border text-sm font-body transition-colors",
                              selectedSize === size
                                ? "border-foreground bg-foreground text-background"
                                : "border-border text-foreground hover:border-foreground"
                            )}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {!product.soldOut ? (
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          if (!selectedSize) { toast.error("Please select a size"); return; }
                          onAddToCart?.(product.id);
                          onOpenChange(false);
                        }}
                        className="flex-1 rounded-lg bg-foreground text-background py-3.5 text-sm font-body font-medium hover:bg-foreground/90 transition-colors"
                      >
                        Add to Bag
                      </button>
                      <button className="flex-1 rounded-lg border border-foreground text-foreground py-3.5 text-sm font-body font-medium hover:bg-secondary transition-colors">
                        Buy Now
                      </button>
                    </div>
                  ) : (
                    <button disabled className="w-full rounded-lg bg-muted text-muted-foreground py-3.5 text-sm font-body font-medium cursor-not-allowed">
                      Sold Out
                    </button>
                  )}
                </>
              )}

              <p className="text-xs font-body text-muted-foreground">Free Shipping & Returns</p>

              <div className="border-t border-border pt-5">
                <h3 className="font-body text-sm font-semibold text-foreground mb-3">Description</h3>
                <ul className="space-y-1.5 text-sm font-body text-muted-foreground">
                  <li>• Curated by your stylist for your style profile</li>
                  <li>• Versatile piece for multiple occasions</li>
                  <li>• Premium quality materials</li>
                  <li>• Easy to style with existing wardrobe</li>
                </ul>
              </div>
            </div>
          </div>
        ) : (
          /* ── Desktop ── */
          <div className="flex flex-row max-h-[85vh]">
            <div className="relative w-1/2 shrink-0 bg-card">
              <div className="aspect-[3/4] overflow-hidden">
                <Image src={product.image} alt={product.brand} width={400} height={533} unoptimized className="w-full h-full object-cover" />
              </div>
              <button
                onClick={() => setWishlisted(!wishlisted)}
                className="absolute top-4 right-4 h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center hover:bg-background transition-colors"
              >
                <HeartIcon className={cn("h-5 w-5", wishlisted ? "fill-foreground text-foreground" : "text-foreground")} />
              </button>
            </div>

            <div className="w-1/2 overflow-y-auto p-8 flex flex-col">
              <p className="font-body text-sm text-muted-foreground mb-1">{product.brand}</p>
              <h2 className="font-display text-2xl mb-2">{product.brand}</h2>
              <p className="font-display text-xl mb-5">{product.soldOut ? "Sold out" : product.price}</p>

              {isStylist ? (
                <>
                  <div className="mb-6">{renderStylistChecks()}</div>
                  <button
                    onClick={handleAdd}
                    className="w-full rounded-lg bg-foreground text-background py-3.5 text-sm font-body font-medium hover:bg-foreground/90 transition-colors mb-6 inline-flex items-center justify-center gap-2"
                  >
                    <PlusIcon className="h-4 w-4" />
                    {addLabel ?? "Add to canvas"}
                  </button>
                </>
              ) : (
                <>
                  {!product.soldOut && (
                    <div className="mb-6">
                      <p className="font-body text-sm font-medium text-foreground mb-3">Size:</p>
                      <div className="flex flex-wrap gap-2">
                        {sizes.map((size) => (
                          <button
                            key={size}
                            onClick={() => setSelectedSize(size)}
                            className={cn(
                              "h-10 min-w-[3rem] px-3 rounded-md border text-sm font-body transition-colors",
                              selectedSize === size
                                ? "border-foreground bg-foreground text-background"
                                : "border-border text-foreground hover:border-foreground"
                            )}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {!product.soldOut ? (
                    <div className="flex gap-3 mb-6">
                      <button
                        onClick={() => {
                          if (!selectedSize) { toast.error("Please select a size"); return; }
                          onAddToCart?.(product.id);
                          onOpenChange(false);
                        }}
                        className="flex-1 rounded-lg bg-foreground text-background py-3.5 text-sm font-body font-medium hover:bg-foreground/90 transition-colors"
                      >
                        Add to Bag
                      </button>
                      <button className="flex-1 rounded-lg border border-foreground text-foreground py-3.5 text-sm font-body font-medium hover:bg-secondary transition-colors">
                        Buy Now
                      </button>
                    </div>
                  ) : (
                    <button disabled className="w-full rounded-lg bg-muted text-muted-foreground py-3.5 text-sm font-body font-medium cursor-not-allowed mb-6">
                      Sold Out
                    </button>
                  )}
                </>
              )}

              <p className="text-xs font-body text-muted-foreground mb-6">Free Shipping & Returns</p>

              <div className="border-t border-border pt-5">
                <h3 className="font-body text-sm font-semibold text-foreground mb-3">Description</h3>
                <ul className="space-y-1.5 text-sm font-body text-muted-foreground">
                  <li>• Curated by your stylist for your style profile</li>
                  <li>• Versatile piece for multiple occasions</li>
                  <li>• Premium quality materials</li>
                  <li>• Easy to style with existing wardrobe</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
