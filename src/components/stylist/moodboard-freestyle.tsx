"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export interface FreestyleItem {
  src: string;
  // Normalized 0-1 coordinates relative to canvas (top-left origin) so
  // layout scales when the parent's canvas size changes.
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

interface MoodBoardFreestyleProps {
  items: FreestyleItem[];
  onChange: (items: FreestyleItem[]) => void;
  onRemove?: (index: number) => void;
  editable?: boolean;
  className?: string;
}

const MIN_SIZE = 0.12;
const MAX_SIZE = 1;

export function MoodBoardFreestyle({
  items,
  onChange,
  onRemove,
  editable = true,
  className,
}: MoodBoardFreestyleProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const dragState = useRef<
    | {
        type: "move" | "resize";
        idx: number;
        startX: number;
        startY: number;
        origX: number;
        origY: number;
        origW: number;
        origH: number;
        canvasW: number;
        canvasH: number;
      }
    | null
  >(null);

  const beginDrag = (
    e: React.PointerEvent,
    idx: number,
    type: "move" | "resize",
  ) => {
    if (!editable) return;
    e.stopPropagation();
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const it = items[idx];
    dragState.current = {
      type,
      idx,
      startX: e.clientX,
      startY: e.clientY,
      origX: it.x,
      origY: it.y,
      origW: it.w,
      origH: it.h,
      canvasW: rect.width,
      canvasH: rect.height,
    };
    const maxZ = Math.max(0, ...items.map((i) => i.z));
    const next = items.map((i, n) => (n === idx ? { ...i, z: maxZ + 1 } : i));
    onChange(next);
    setActiveIdx(idx);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const s = dragState.current;
      if (!s) return;
      const dx = (e.clientX - s.startX) / s.canvasW;
      const dy = (e.clientY - s.startY) / s.canvasH;
      const next = items.map((it, n) => {
        if (n !== s.idx) return it;
        if (s.type === "move") {
          const x = Math.min(Math.max(0, s.origX + dx), 1 - it.w);
          const y = Math.min(Math.max(0, s.origY + dy), 1 - it.h);
          return { ...it, x, y };
        }
        const delta = Math.max(dx, dy);
        const w = Math.min(Math.max(MIN_SIZE, s.origW + delta), MAX_SIZE - it.x);
        const aspect = s.origH / s.origW;
        const h = Math.min(Math.max(MIN_SIZE, w * aspect), MAX_SIZE - it.y);
        return { ...it, w, h };
      });
      onChange(next);
    };
    const handleUp = () => {
      dragState.current = null;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [items, onChange]);

  return (
    <div
      ref={canvasRef}
      className={cn(
        "relative w-full h-full bg-background overflow-hidden",
        className,
      )}
      onPointerDown={() => setActiveIdx(null)}
    >
      {items.map((it, i) => (
        <div
          key={`${it.src}-${i}`}
          className={cn(
            "absolute group/item select-none",
            editable && "cursor-move",
            activeIdx === i && "ring-2 ring-accent",
          )}
          style={{
            left: `${it.x * 100}%`,
            top: `${it.y * 100}%`,
            width: `${it.w * 100}%`,
            height: `${it.h * 100}%`,
            zIndex: it.z,
          }}
          onPointerDown={(e) => beginDrag(e, i, "move")}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={it.src}
            alt={`Mood ${i + 1}`}
            className="h-full w-full object-cover pointer-events-none"
            draggable={false}
          />
          {editable && (
            <>
              {onRemove && (
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(i);
                  }}
                  className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-foreground/70 text-background flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-opacity"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <div
                onPointerDown={(e) => beginDrag(e, i, "resize")}
                className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize bg-foreground/70 opacity-0 group-hover/item:opacity-100 transition-opacity"
                style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
              />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Distribute a list of image srcs across a freestyle canvas in a loose grid.
 * Used to seed initial layout when switching from Template → Freestyle mode.
 */
export function defaultFreestyleLayout(srcs: string[]): FreestyleItem[] {
  const n = srcs.length;
  if (n === 0) return [];
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const cellW = 1 / cols;
  const cellH = 1 / rows;
  const size = Math.min(cellW, cellH) * 0.85;
  return srcs.map((src, i) => {
    const cx = (i % cols) * cellW + cellW / 2;
    const cy = Math.floor(i / cols) * cellH + cellH / 2;
    return {
      src,
      x: Math.max(0, Math.min(1 - size, cx - size / 2)),
      y: Math.max(0, Math.min(1 - size, cy - size / 2)),
      w: size,
      h: size,
      z: i + 1,
    };
  });
}
