"use client";

// Asymmetric mood-board grid with editorial span rules for 1–9 images.
// Ported verbatim from Loveable `stylist/MoodBoardGrid.tsx`.

import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";

interface MoodBoardGridProps {
  images: { id: string; url: string }[];
  onRemove?: (id: string) => void;
  editable?: boolean;
  className?: string;
}

function getSpan(index: number, total: number): string {
  if (total === 1) return "col-span-3 row-span-3";
  if (total === 2) return index === 0 ? "col-span-2 row-span-2" : "col-span-1 row-span-2";
  if (total === 3) return index === 0 ? "col-span-2 row-span-2" : "col-span-1 row-span-1";
  if (total === 4) return "col-span-1 row-span-1";
  if (total === 5) return index < 2 ? "col-span-1 row-span-2" : "col-span-1 row-span-1";
  if (total === 6) return index < 2 ? "col-span-1 row-span-2" : "col-span-1 row-span-1";
  if (total === 7 || total === 8) {
    if (index === 0) return "col-span-2 row-span-2";
    return "col-span-1 row-span-1";
  }
  return "col-span-1 row-span-1";
}

export function MoodBoardGrid({
  images,
  onRemove,
  editable = false,
  className,
}: MoodBoardGridProps) {
  const total = images.length;
  return (
    <div
      className={cn(
        "grid grid-cols-3 auto-rows-[minmax(120px,1fr)] gap-1",
        className,
      )}
    >
      {images.map((img, i) => (
        <div
          key={img.id}
          className={cn(
            "relative overflow-hidden bg-muted group/cell",
            getSpan(i, total),
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img.url}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover/cell:scale-105"
            loading="lazy"
          />
          {editable && onRemove && (
            <button
              onClick={() => onRemove(img.id)}
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
