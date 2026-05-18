"use client";

import { MoodBoardGrid } from "@/components/stylist/moodboard-grid";
import { cn } from "@/lib/utils";

// Plain <img> tags are used throughout this file (rather than next/image)
// because board item URLs frequently point at retailer CDNs that aren't in
// the Next/Image remotePatterns allowlist. The rest of the codebase uses the
// same approach for any surface that renders user-supplied retailer URLs.

// Canonical board renderer. Every surface that shows a stylist-composed board
// — session chat, discovery feed, stylist profile, /board/[id] share link,
// send-dialog previews — uses this component so the rendering matches what
// the stylist saw while building. The aspect-square invariant and the
// underlying layout rules are deliberately concentrated here; per-surface
// CSS-grid or columns-N variants are the drift source we are removing.

export interface BoardThumbnailItem {
  id: string;
  /** Resolved image src — caller is responsible for image resolution per source. */
  imageUrl: string | null;
  /** Percent (0-100) from the left edge of the square canvas. Null → fall back to grid. */
  x: number | null;
  /** Percent (0-100) from the top edge. Null → fall back to grid. */
  y: number | null;
  /** Optional explicit size (percent 0-100). Free-form styleboard items carry this;
   *  legacy rows leave it null and inherit the builder's fixed 30%-wide tile.
   *  Freestyle moodboard photos always carry it. */
  width?: number | null;
  height?: number | null;
  /** Free-form rotation in degrees. Null/undefined → 0. */
  rotation?: number | null;
  zIndex?: number | null;
  flipH?: boolean | null;
  flipV?: boolean | null;
  crop?: { top: number; right: number; bottom: number; left: number } | null;
  /** Server-persisted background-removed PNG URL. When set, preferred over imageUrl. */
  processedImageUrl?: string | null;
}

export interface BoardThumbnailProps {
  type: "MOODBOARD" | "STYLEBOARD";
  /** Used for moodboards. "freestyle" = drag-positioned photos; anything else (or null) = editorial template grid. */
  canvasMode?: string | null;
  /** Moodboard template-mode photos (in order). */
  photoUrls?: string[];
  /** Styleboard canvas items OR freestyle moodboard photos. */
  items?: BoardThumbnailItem[];
  className?: string;
  /** Hide the border styling — useful inside dialog previews that supply their own chrome. */
  flat?: boolean;
}

const TILE_WIDTH_PCT = 30; // mirrors builder.tsx min-canvas tile width

export function BoardThumbnail({
  type,
  canvasMode,
  photoUrls,
  items,
  className,
  flat = false,
}: BoardThumbnailProps) {
  const baseClasses = cn(
    "relative aspect-square w-full overflow-hidden bg-background",
    flat ? "rounded-sm" : "rounded-md",
    className,
  );

  if (type === "MOODBOARD") {
    if (canvasMode === "freestyle" && items && items.length > 0) {
      return (
        <div className={baseClasses}>
          <FreestyleLayer items={items} />
        </div>
      );
    }
    const urls = (photoUrls ?? []).filter((u): u is string => Boolean(u));
    if (urls.length === 0) {
      return (
        <div
          className={cn(
            baseClasses,
            "grid place-items-center bg-muted text-xs text-muted-foreground",
          )}
        >
          No photos yet
        </div>
      );
    }
    return (
      <div className={baseClasses}>
        <MoodBoardGrid images={urls} className="h-full" />
      </div>
    );
  }

  // STYLEBOARD
  const positioned = (items ?? []).filter(
    (it) => (it.imageUrl || it.processedImageUrl) && it.x != null && it.y != null,
  );
  if (positioned.length > 0) {
    return (
      <div className={baseClasses}>
        <CanvasLayer items={positioned} />
      </div>
    );
  }

  // Legacy fallback: items without canvas coordinates render as a columns-2 mosaic
  // inside the square. Pre-canvas styleboards (no x/y persisted) hit this path.
  const fallbackUrls = (items ?? [])
    .map((it) => it.imageUrl)
    .filter((u): u is string => Boolean(u));
  if (fallbackUrls.length === 0) {
    return (
      <div
        className={cn(
          baseClasses,
          "grid place-items-center bg-muted text-xs text-muted-foreground",
        )}
      >
        No items yet
      </div>
    );
  }
  return (
    <div className={baseClasses}>
      <div className="columns-2 gap-1.5 h-full">
        {fallbackUrls.map((src, i) => (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            key={`${src}-${i}`}
            src={src}
            alt={`Look piece ${i + 1}`}
            className="mb-1.5 w-full rounded-sm object-cover"
            loading="lazy"
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Styleboard canvas — items positioned at (x%, y%) centred via translate, with
 * a fixed 30% tile width and 1:1 aspect ratio. Mirrors builder.tsx's min-canvas
 * branch so the chat card / feed / profile / share view reproduce exactly what
 * the stylist saw while composing.
 */
function CanvasLayer({ items }: { items: BoardThumbnailItem[] }) {
  return (
    <>
      {items.map((it, idx) => {
        const crop = it.crop ?? { top: 0, right: 0, bottom: 0, left: 0 };
        const sX = 100 / Math.max(1, 100 - crop.left - crop.right);
        const sY = 100 / Math.max(1, 100 - crop.top - crop.bottom);
        const flipScaleX = it.flipH ? -1 : 1;
        const flipScaleY = it.flipV ? -1 : 1;
        const widthPct = it.width ?? TILE_WIDTH_PCT;
        const rotation = it.rotation ?? 0;
        const src = it.processedImageUrl || it.imageUrl;
        return (
          <div
            key={it.id}
            style={{
              left: `${it.x}%`,
              top: `${it.y}%`,
              width: `${widthPct}%`,
              aspectRatio: "1 / 1",
              zIndex: it.zIndex ?? idx + 1,
              transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
            }}
            className="absolute overflow-hidden rounded-sm border border-border bg-card shadow-sm"
          >
            <div
              className="absolute"
              style={{
                top: `${-crop.top * sY}%`,
                left: `${-crop.left * sX}%`,
                width: `${sX * 100}%`,
                height: `${sY * 100}%`,
                transform: `scale(${flipScaleX}, ${flipScaleY})`,
              }}
            >
              {src ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={src}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                  loading="lazy"
                />
              ) : null}
            </div>
          </div>
        );
      })}
    </>
  );
}

/**
 * Freestyle moodboard — photos with explicit width/height percentages, no tile
 * constraint. Mirrors MoodBoardFreestyle's non-editable render path.
 */
function FreestyleLayer({ items }: { items: BoardThumbnailItem[] }) {
  return (
    <>
      {items.map((it, idx) => {
        if (!it.imageUrl) return null;
        const widthPct = it.width ?? 30;
        const heightPct = it.height ?? 30;
        return (
          <div
            key={it.id}
            style={{
              left: `${it.x ?? 0}%`,
              top: `${it.y ?? 0}%`,
              width: `${widthPct}%`,
              height: `${heightPct}%`,
              zIndex: it.zIndex ?? idx + 1,
            }}
            className="absolute overflow-hidden"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={it.imageUrl}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
              loading="lazy"
            />
          </div>
        );
      })}
    </>
  );
}
