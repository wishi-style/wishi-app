"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Mobile-only horizontal carousel for the #StyledByWishi section. Verbatim
 * port of smart-spark-craft Index.tsx::StyledLooksCarousel (lines 147-210).
 * Mechanical changes only: <img> → <Image>, useRef typing.
 */
export function StyledLooksCarousel({ looks }: { looks: readonly string[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    const cardWidth = container.firstElementChild?.clientWidth ?? 300;
    const gap = 16;
    const idx = Math.round(container.scrollLeft / (cardWidth + gap));
    setActiveIdx(idx);
  };

  return (
    <div className="md:hidden relative">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-4"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {looks.map((src, i) => (
          <div
            key={src}
            className="relative w-[80vw] aspect-[601/712] overflow-hidden rounded-xl shrink-0 snap-center"
          >
            <Image
              src={src}
              alt={`Styled look ${i + 1}`}
              fill
              sizes="80vw"
              className="object-cover"
              loading="lazy"
            />
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-2 mt-3">
        {looks.map((src, i) => (
          <button
            key={src}
            type="button"
            aria-label={`Go to look ${i + 1}`}
            className={cn(
              "h-2 rounded-full transition-all",
              i === activeIdx ? "w-6 bg-foreground" : "w-2 bg-foreground/30",
            )}
            onClick={() => {
              const container = scrollRef.current;
              if (!container) return;
              const cardWidth = container.firstElementChild?.clientWidth ?? 300;
              container.scrollTo({
                left: i * (cardWidth + 16),
                behavior: "smooth",
              });
              setActiveIdx(i);
            }}
          />
        ))}
      </div>
    </div>
  );
}
