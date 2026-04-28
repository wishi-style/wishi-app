"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  images: string[];
  alt: string;
}

export function PortfolioCarousel({ images, alt }: Props) {
  const [current, setCurrent] = useState(0);
  if (images.length === 0) return null;

  const prev = () =>
    setCurrent((p) => (p === 0 ? images.length - 1 : p - 1));
  const next = () =>
    setCurrent((p) => (p === images.length - 1 ? 0 : p + 1));

  return (
    <div className="relative">
      <div className="aspect-square overflow-hidden">
        <Image
          src={images[current]}
          alt={`${alt} portfolio ${current + 1}`}
          width={600}
          height={600}
          className="w-full h-full object-cover transition-opacity duration-500"
          priority={current === 0}
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
              <button
                key={i}
                type="button"
                onClick={() => setCurrent(i)}
                aria-label={`Go to portfolio image ${i + 1}`}
                className={cn(
                  "h-2 w-2 rounded-full transition-colors",
                  i === current ? "bg-foreground" : "bg-foreground/30",
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
