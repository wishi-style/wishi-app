"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { PlusIcon, CheckIcon, HeartIcon, RefreshCwIcon, ThumbsDownIcon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RestyleWizard } from "@/components/boards/restyle-wizard";

export interface ProductItem {
  id: string;
  image: string;
  brand: string;
  price: string;
  soldOut?: boolean;
}

export type StyleBoardFeedback = "love" | "revise" | "not_my_style";

export interface StyleBoardProps {
  title: string;
  message: string;
  collageImages?: string[];
  products?: ProductItem[];
  onAddToCart?: (productId: string) => void;
  onFeedback?: (feedback: StyleBoardFeedback) => void;
  feedback?: StyleBoardFeedback | null;
}

export const defaultProducts: ProductItem[] = [];
const defaultCollage: string[] = [];

export function StyleBoard({
  title,
  message,
  collageImages = defaultCollage,
  products = defaultProducts,
  onAddToCart,
  onFeedback,
  feedback: controlledFeedback,
}: StyleBoardProps) {
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [internalFeedback, setInternalFeedback] = useState<StyleBoardFeedback | null>(null);
  const [restyleOpen, setRestyleOpen] = useState(false);
  const feedback = controlledFeedback !== undefined ? controlledFeedback : internalFeedback;

  const handleAdd = (id: string) => {
    setAddedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    onAddToCart?.(id);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
      {/* Header */}
      <h3 className="font-display text-2xl mb-2">{title}</h3>
      <p className="font-body text-base leading-7 text-foreground mb-6">
        {message}
      </p>

      {/* Two-column layout: collage + product grid (stacks on mobile) */}
      <div className="flex flex-col md:flex-row gap-4">
        {/* Left: Outfit collage – always square */}
        <div className="w-full md:w-1/2 shrink-0 aspect-square overflow-hidden rounded-md">
          <div className="columns-2 gap-1.5 h-full">
            {collageImages.map((src, i) => (
              <Image
                key={i}
                src={src}
                alt={`Look piece ${i + 1}`}
                width={400}
                height={400}
                unoptimized
                className="w-full mb-1.5 rounded-sm object-cover"
                loading="lazy"
              />
            ))}
          </div>
        </div>

        {/* Right: Product grid – scrollable */}
        <div className="w-full md:w-1/2 relative">
          <ScrollArea className="h-full">
            <div className="grid grid-cols-3 gap-2 auto-rows-min pr-2">
              {products.map((product) => {
            const isAdded = addedIds.has(product.id);
            return (
              <div
                key={product.id}
                className="relative rounded-lg border border-border bg-white p-2 flex flex-col"
              >
                {/* Add button */}
                {!product.soldOut && (
                  <button
                    onClick={() => handleAdd(product.id)}
                    className={cn(
                      "absolute top-2 right-2 h-6 w-6 rounded-full flex items-center justify-center transition-colors z-10",
                      isAdded
                        ? "bg-foreground text-background"
                        : "bg-card border border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                    )}
                  >
                    {isAdded ? <CheckIcon className="h-3 w-3" /> : <PlusIcon className="h-3 w-3" />}
                  </button>
                )}

                {/* Product image */}
                <div className="aspect-square overflow-hidden rounded-sm mb-2">
                  <Image
                    src={product.image}
                    alt={product.brand}
                    width={400}
                    height={400}
                    unoptimized
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>

                {/* Info */}
                <p className="font-body text-xs font-medium text-foreground text-center truncate">
                  {product.brand}
                </p>
                <p className="font-body text-xs text-foreground text-center">
                  {product.soldOut ? "Sold out" : product.price}
                </p>
              </div>
            );
          })}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Feedback buttons */}
      <div className="flex items-center gap-2 mt-5 pt-5 border-t border-border">
        {([
          { key: "love" as const, label: "Love", icon: HeartIcon },
          { key: "revise" as const, label: "Revise", icon: RefreshCwIcon },
          { key: "not_my_style" as const, label: "Not my style", icon: ThumbsDownIcon },
        ]).map(({ key, label, icon: Icon }) => {
          const isSelected = feedback === key;
          return (
            <button
              key={key}
              onClick={() => {
                if (key === "revise") {
                  setRestyleOpen(true);
                  return;
                }
                const next = isSelected ? null : key;
                setInternalFeedback(next);
                if (next) onFeedback?.(next);
              }}
              className={cn(
                "flex items-center gap-1.5 sm:gap-2 rounded-full px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm font-body transition-colors border",
                isSelected
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-foreground border-border hover:border-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Restyle Wizard */}
      <RestyleWizard
        open={restyleOpen}
        onOpenChange={setRestyleOpen}
        products={products.map((p) => ({
          id: p.id,
          name: p.brand,
          brand: p.brand,
          imageUrl: p.image,
          priceInCents: null,
        }))}
        onSubmit={(restyleFeedback) => {
          setInternalFeedback("revise");
          onFeedback?.("revise");
          console.log("Restyle feedback:", restyleFeedback);
        }}
      />
    </div>
  );
}
