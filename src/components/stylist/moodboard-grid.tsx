"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";

interface MoodBoardGridProps {
  images: string[];
  onRemove?: (index: number) => void;
  editable?: boolean;
  className?: string;
}

/**
 * A chic asymmetric grid for 1–9 images.
 * Uses CSS grid with span rules to create editorial layouts.
 */
export function MoodBoardGrid({ images, onRemove, editable = false, className }: MoodBoardGridProps) {
  const count = images.length;

  // Grid config per image count for a curated feel
  const getSpan = (index: number, total: number): string => {
    if (total === 1) return "col-span-3 row-span-3";
    if (total === 2) return index === 0 ? "col-span-2 row-span-2" : "col-span-1 row-span-2";
    if (total === 3) {
      if (index === 0) return "col-span-2 row-span-2";
      return "col-span-1 row-span-1";
    }
    if (total === 4) return "col-span-1 row-span-1";
    if (total === 5) {
      if (index < 2) return "col-span-1 row-span-2";
      return "col-span-1 row-span-1";
    }
    if (total === 6) return index < 2 ? "col-span-1 row-span-2" : "col-span-1 row-span-1";
    if (total === 7) {
      if (index === 0) return "col-span-2 row-span-2";
      return "col-span-1 row-span-1";
    }
    if (total === 8) {
      if (index === 0) return "col-span-2 row-span-2";
      if (index < 3) return "col-span-1 row-span-1";
      return "col-span-1 row-span-1";
    }
    // 9 images — true 3x3
    if (total === 9) return "col-span-1 row-span-1";

    return "col-span-1 row-span-1";
  };

  return (
    <div
      className={cn(
        "grid grid-cols-3 auto-rows-[minmax(120px,1fr)] gap-1",
        className
      )}
    >
      {images.map((src, i) => (
        <div
          key={`${src}-${i}`}
          className={cn(
            "relative overflow-hidden bg-muted group/cell",
            getSpan(i, count)
          )}
        >
          <Image
            src={src}
            alt={`Mood ${i + 1}`}
            width={400}
            height={400}
            unoptimized
            className="h-full w-full object-cover transition-transform duration-300 group-hover/cell:scale-105"
            loading="lazy"
          />
          {editable && onRemove && (
            <button
              onClick={() => onRemove(i)}
              className="absolute top-2 right-2 h-6 w-6 rounded-full bg-foreground/70 text-background flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition-opacity"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
