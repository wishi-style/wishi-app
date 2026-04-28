"use client";

import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PortfolioCarousel({ images }: { images: string[] }) {
  const [current, setCurrent] = useState(0);

  if (images.length === 0) {
    return (
      <div className="relative aspect-square bg-muted flex items-center justify-center">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Portfolio coming soon
        </p>
      </div>
    );
  }

  const prev = () =>
    setCurrent((p) => (p === 0 ? images.length - 1 : p - 1));
  const next = () =>
    setCurrent((p) => (p === images.length - 1 ? 0 : p + 1));

  return (
    <div className="relative">
      <div className="aspect-square overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[current]}
          alt={`Portfolio image ${current + 1}`}
          className="w-full h-full object-cover transition-opacity duration-500"
        />
      </div>

      {images.length > 1 && (
        <div className="flex items-center justify-center gap-4 py-3">
          <button
            type="button"
            onClick={prev}
            aria-label="Previous portfolio image"
            className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-accent transition-colors"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <div className="flex gap-1.5">
            {images.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === current
                    ? "w-6 bg-foreground"
                    : "w-1.5 bg-foreground/20",
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={next}
            aria-label="Next portfolio image"
            className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-accent transition-colors"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
