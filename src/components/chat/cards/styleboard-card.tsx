"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckIcon,
  Heart,
  RefreshCw,
  Share2,
  ThumbsDown,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  RestyleWizard,
  type RestyleProduct,
  type RestyleFeedback,
} from "@/components/boards/restyle-wizard";
import type { ViewerRole } from "../message-renderers";

// Verbatim port of smart-spark-craft/src/components/StyleBoard.tsx
// (HEAD on origin/main). Loveable contract:
//   - Two-column layout: left collage, right scrollable product grid.
//   - Inline reaction pills (Love / Revise / Not my style). Click submits
//     in place; the chosen pill stays filled to record the rating.
//   - Revise opens RestyleWizard which collects per-item structured
//     feedback and POSTs it as a single REVISE rating.
//   - Stylist sees the same card with the chosen pill filled (read-only).
//   - Share icon defers to launch follow-up; not wired in v1.

type Rating = "LOVE" | "REVISE" | "NOT_MY_STYLE";

interface StyleBoardSummary {
  id: string;
  description?: string | null;
  stylistNote?: string | null;
  title?: string | null;
  rating?: Rating | null;
  feedbackText?: string | null;
  ratedAt?: string | null;
  isRevision?: boolean;
}

interface PreviewProduct {
  id: string;
  brand: string;
  name: string;
  image: string | null;
  price: string;
  priceInCents: number | null;
  soldOut: boolean;
  inventoryProductId: string | null;
}

interface PreviewPayload {
  thumbnails: string[];
  products: PreviewProduct[];
}

export function StyleboardCard({
  boardId,
  isRestyle,
  body,
  sessionId,
  viewerRole,
}: {
  boardId: string | null;
  isRestyle: boolean;
  body: string | null;
  sessionId: string;
  viewerRole: ViewerRole;
}) {
  const [board, setBoard] = useState<StyleBoardSummary | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [submitting, setSubmitting] = useState<Rating | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [restyleOpen, setRestyleOpen] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!boardId) return;
    let cancelled = false;
    Promise.all([
      fetch(`/api/styleboards/${boardId}`, { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : null,
      ),
      fetch(`/api/styleboards/${boardId}/preview`, { cache: "no-store" }).then(
        (r) => (r.ok ? r.json() : null),
      ),
    ])
      .then(([data, prev]) => {
        if (cancelled) return;
        if (data) setBoard(data as StyleBoardSummary);
        if (prev) setPreview(prev as PreviewPayload);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  async function postFeedback(payload: {
    rating: Rating;
    feedbackText?: string;
    itemFeedback?: Array<{
      itemId: string;
      reaction: Rating;
      feedbackText?: string;
    }>;
    feedbackDetail?: unknown;
  }) {
    if (!boardId) return false;
    setSubmitting(payload.rating);
    setFeedbackError(null);
    const previous = board;
    setBoard((b) => (b ? { ...b, rating: payload.rating } : b));
    try {
      const res = await fetch(`/api/styleboards/${boardId}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setBoard(previous);
        setFeedbackError(json.error ?? "Could not save feedback");
        return false;
      }
      return true;
    } catch {
      setBoard(previous);
      setFeedbackError("Could not save feedback");
      return false;
    } finally {
      setSubmitting(null);
    }
  }

  const handlePillClick = (rating: Rating) => {
    if (rating === "REVISE") {
      setRestyleOpen(true);
      return;
    }
    void postFeedback({ rating });
  };

  const handleRestyleSubmit = async (feedback: RestyleFeedback) => {
    const itemFeedback = Object.entries(feedback)
      .filter(([, v]) => v.reasons.length > 0 || v.note.trim().length > 0)
      .map(([itemId, v]) => ({
        itemId,
        reaction: "REVISE" as const,
        feedbackText: [v.reasons.join(", "), v.note.trim()]
          .filter(Boolean)
          .join(" — ") || undefined,
      }));
    const concatNote = itemFeedback
      .map((f) => f.feedbackText)
      .filter(Boolean)
      .join("\n");
    await postFeedback({
      rating: "REVISE",
      feedbackText: concatNote || undefined,
      itemFeedback,
      feedbackDetail: feedback,
    });
  };

  const addToCart = (productInventoryId: string | null, itemId: string) => {
    if (!productInventoryId || viewerRole !== "CLIENT") return;
    startTransition(async () => {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryProductId: productInventoryId,
          sessionId,
          quantity: 1,
        }),
      });
      if (res.ok) {
        setAddedIds((prev) => new Set(prev).add(itemId));
        router.refresh();
      }
    });
  };

  const title = board?.title ?? (isRestyle ? "Restyled Look" : "New Look");
  const message =
    body ||
    board?.stylistNote?.trim() ||
    board?.description?.trim() ||
    "";
  const rating = board?.rating ?? null;
  const canRate = viewerRole === "CLIENT" && rating == null;
  const restyleProducts: RestyleProduct[] =
    preview?.products.map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      imageUrl: p.image,
      priceInCents: p.priceInCents,
    })) ?? [];

  const ratingPills: Array<{ key: Rating; label: string; icon: typeof Heart }> = [
    { key: "LOVE", label: "Love", icon: Heart },
    { key: "REVISE", label: "Revise", icon: RefreshCw },
    { key: "NOT_MY_STYLE", label: "Not my style", icon: ThumbsDown },
  ];

  return (
    <>
      <div className="max-w-3xl rounded-lg border border-border bg-card p-6 shadow-sm">
        {/* Header */}
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-heading text-2xl">{title}</h3>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                /* Share defers to launch C1 follow-up. */
              }}
              className="rounded-full p-1.5 transition-colors hover:bg-muted"
              aria-label="Share style board"
            >
              <Share2 className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>
        {message && (
          <p className="mb-6 text-base leading-7 text-foreground">{message}</p>
        )}

        {/* Two-column layout: collage + product grid (stacks on mobile) */}
        <div className="flex flex-col gap-4 md:flex-row">
          {/* Left: collage */}
          <div className="aspect-square w-full shrink-0 overflow-hidden rounded-md md:w-1/2">
            {preview && preview.thumbnails.length > 0 ? (
              <div className="columns-2 gap-1.5 h-full">
                {preview.thumbnails.map((src, i) => (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    key={i}
                    src={src}
                    alt={`Look piece ${i + 1}`}
                    className="mb-1.5 w-full rounded-sm object-cover"
                    loading="lazy"
                  />
                ))}
              </div>
            ) : (
              <div className="grid h-full place-items-center bg-muted text-xs text-muted-foreground">
                {preview ? "No items yet" : "Loading preview…"}
              </div>
            )}
          </div>

          {/* Right: scrollable product grid */}
          <div className="relative w-full md:w-1/2">
            <ScrollArea className="h-full max-h-[420px]">
              <div className="grid auto-rows-min grid-cols-3 gap-3 pr-2">
                {(preview?.products ?? []).map((product) => {
                  const isAdded = addedIds.has(product.id);
                  return (
                    <div
                      key={product.id}
                      className={cn(
                        "group/product relative flex flex-col rounded-lg border bg-card p-3 pb-4 transition-all duration-200",
                        product.soldOut
                          ? "cursor-default border-border opacity-60"
                          : "border-border hover:border-foreground/30 hover:shadow-md",
                      )}
                    >
                      {!product.soldOut && isAdded && (
                        <div className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background">
                          <CheckIcon className="h-3 w-3" />
                        </div>
                      )}
                      <div className="mb-3 aspect-[3/4] overflow-hidden rounded-sm bg-muted">
                        {product.image ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={product.image}
                            alt={product.brand}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover/product:scale-105"
                            loading="lazy"
                          />
                        ) : null}
                      </div>
                      <p className="truncate text-center text-sm font-medium text-foreground">
                        {product.brand}
                      </p>
                      <p className="text-center text-sm text-foreground/70">
                        {product.soldOut ? "Sold out" : product.price}
                      </p>
                      {viewerRole === "CLIENT" &&
                        !product.soldOut &&
                        product.inventoryProductId &&
                        !isAdded && (
                          <button
                            type="button"
                            onClick={() =>
                              addToCart(product.inventoryProductId, product.id)
                            }
                            className="mt-2 w-full rounded-lg border border-border py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-foreground hover:text-background"
                          >
                            Add to Cart
                          </button>
                        )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Feedback pills */}
        <div
          className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-5"
          role="group"
          aria-label="Rate this style board"
        >
          {ratingPills.map(({ key, label, icon: Icon }) => {
            const isSelected = rating === key;
            const disabled =
              !canRate || (submitting !== null && submitting !== key);
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => canRate && handlePillClick(key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors sm:gap-2 sm:px-4 sm:py-2 sm:text-sm",
                  isSelected
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background text-foreground",
                  canRate && !isSelected && "hover:border-foreground",
                  !canRate && "cursor-default opacity-80",
                  submitting === key && "opacity-60",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>
        {feedbackError && (
          <p className="mt-2 text-xs text-destructive">{feedbackError}</p>
        )}
      </div>

      {viewerRole === "CLIENT" && (
        <RestyleWizard
          open={restyleOpen}
          onOpenChange={setRestyleOpen}
          products={restyleProducts}
          onSubmit={handleRestyleSubmit}
        />
      )}
    </>
  );
}
