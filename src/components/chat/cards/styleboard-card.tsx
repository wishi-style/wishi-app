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
import { BoardThumbnail } from "@/components/boards/board-thumbnail";
import { ProductDetailDialog } from "@/components/products/product-detail-dialog";
import type { ChatMessage } from "../use-chat";
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
  feedbackDetail?: unknown;
  ratedAt?: string | null;
  isRevision?: boolean;
}

interface PerItemDetail {
  reasons?: string[];
  note?: string;
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
  x: number | null;
  y: number | null;
  width: number | null;
  rotation: number | null;
  zIndex: number | null;
  flipH: boolean;
  flipV: boolean;
  crop: { top: number; right: number; bottom: number; left: number } | null;
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
  chatMessages,
}: {
  boardId: string | null;
  isRestyle: boolean;
  body: string | null;
  sessionId: string;
  viewerRole: ViewerRole;
  chatMessages?: ChatMessage[];
}) {
  const [board, setBoard] = useState<StyleBoardSummary | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [submitting, setSubmitting] = useState<Rating | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [restyleOpen, setRestyleOpen] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [cartError, setCartError] = useState<string | null>(null);
  const [pdpProduct, setPdpProduct] = useState<PreviewProduct | null>(null);
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

  // Realtime BOARD_UPDATE subscription. When the client rates the board
  // through inline pills or RestyleWizard, the server dispatches a
  // BOARD_UPDATE event onto the conversation. Both sides see it stream in
  // and re-fetch the summary so the chosen pill flips to filled (stylist
  // side) and any feedback summary appears without a page reload.
  const boardUpdateCount = chatMessages?.filter(
    (m) => m.attributes.kind === "BOARD_UPDATE" && m.attributes.boardId === boardId,
  ).length ?? 0;
  useEffect(() => {
    if (!boardId || boardUpdateCount === 0) return;
    let cancelled = false;
    fetch(`/api/styleboards/${boardId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setBoard(data as StyleBoardSummary);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [boardId, boardUpdateCount]);

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
    setCartError(null);
    startTransition(async () => {
      try {
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
          return;
        }
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setCartError(json.error ?? "Could not add to cart");
      } catch {
        setCartError("Could not add to cart");
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
            {/* Share dialog is launch-prep C1; the icon is rendered for
                Loveable parity but the affordance itself is disabled until
                the share flow ships, so it is not in tab order and does not
                fire onClick. */}
            <button
              type="button"
              disabled
              tabIndex={-1}
              aria-hidden="true"
              className="rounded-full p-1.5 opacity-40"
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
          {/* Left: collage. BoardThumbnail mirrors the LookCreator canvas
              composition — same items, same x/y/zIndex/crop/flip — so the
              chat card matches what the stylist saw while building. */}
          <div className="w-full shrink-0 md:w-1/2">
            {preview ? (
              <BoardThumbnail
                type="STYLEBOARD"
                items={preview.products.map((p) => ({
                  id: p.id,
                  imageUrl: p.image,
                  x: p.x,
                  y: p.y,
                  width: p.width,
                  rotation: p.rotation,
                  zIndex: p.zIndex,
                  flipH: p.flipH,
                  flipV: p.flipV,
                  crop: p.crop,
                }))}
              />
            ) : (
              <div className="aspect-square w-full grid place-items-center rounded-md bg-muted text-xs text-muted-foreground">
                Loading preview…
              </div>
            )}
          </div>

          {/* Right: scrollable product grid */}
          <div className="relative w-full md:w-1/2">
            <ScrollArea className="h-full max-h-[420px]">
              <div className="grid auto-rows-min grid-cols-3 gap-3 pr-2">
                {(preview?.products ?? []).map((product) => {
                  const isAdded = addedIds.has(product.id);
                  const tileBody = (
                    <>
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
                    </>
                  );
                  const tileClass = cn(
                    "group/product relative flex flex-col rounded-lg border bg-card p-3 pb-4 transition-all duration-200",
                    product.soldOut
                      ? "cursor-default border-border opacity-60"
                      : "border-border hover:border-foreground/30 hover:shadow-md",
                  );
                  return (
                    <div key={product.id} className={tileClass}>
                      {product.inventoryProductId ? (
                        <button
                          type="button"
                          onClick={() => setPdpProduct(product)}
                          className="flex flex-1 flex-col text-left"
                        >
                          {tileBody}
                        </button>
                      ) : (
                        tileBody
                      )}
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
        {cartError && (
          <p className="mt-2 text-xs text-destructive">{cartError}</p>
        )}

        {/* Stylist sees the rating + per-item feedback inline once the client
            rates. The card flipping with this content IS the in-chat signal —
            no separate "loved the styleboard" stage bubble. */}
        {rating != null && viewerRole === "STYLIST" && board && (
          <StyleboardFeedbackSummary
            rating={rating}
            feedbackText={board.feedbackText ?? null}
            feedbackDetail={board.feedbackDetail}
            products={preview?.products ?? []}
          />
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

      <ProductDetailDialog
        open={pdpProduct !== null}
        onOpenChange={(o) => {
          if (!o) setPdpProduct(null);
        }}
        product={
          pdpProduct
            ? {
                id: pdpProduct.id,
                image: pdpProduct.image ?? "",
                brand: pdpProduct.brand,
                name: pdpProduct.name,
                price: pdpProduct.price,
                soldOut: pdpProduct.soldOut,
              }
            : null
        }
        onAddToCart={() => {
          if (pdpProduct) {
            addToCart(pdpProduct.inventoryProductId, pdpProduct.id);
          }
        }}
      />
    </>
  );
}

function StyleboardFeedbackSummary({
  rating,
  feedbackText,
  feedbackDetail,
  products,
}: {
  rating: Rating;
  feedbackText: string | null;
  feedbackDetail: unknown;
  products: PreviewProduct[];
}) {
  const detail =
    feedbackDetail && typeof feedbackDetail === "object"
      ? (feedbackDetail as Record<string, PerItemDetail>)
      : null;
  const productById = new Map(products.map((p) => [p.id, p]));
  const entries = detail
    ? Object.entries(detail).filter(
        ([, v]) => (v?.reasons?.length ?? 0) > 0 || (v?.note ?? "").trim().length > 0,
      )
    : [];
  const ratingLabel = rating.replaceAll("_", " ").toLowerCase();

  return (
    <div className="mt-5 space-y-3 border-t border-border pt-5">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Client said: <span className="text-foreground">{ratingLabel}</span>
      </p>
      {entries.length > 0 && (
        <ul className="space-y-2">
          {entries.map(([itemId, value]) => {
            const product = productById.get(itemId);
            const label =
              product?.brand && product?.name
                ? `${product.brand} — ${product.name}`
                : product?.brand ?? product?.name ?? "Item";
            return (
              <li
                key={itemId}
                className="rounded-md bg-muted/40 px-3 py-2 text-xs text-foreground"
              >
                <p className="font-medium text-muted-foreground">{label}</p>
                {value?.reasons && value.reasons.length > 0 && (
                  <p className="mt-0.5">{value.reasons.join(", ")}</p>
                )}
                {value?.note && (
                  <p className="mt-0.5 italic text-muted-foreground">
                    “{value.note}”
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {feedbackText && entries.length === 0 && (
        <p className="whitespace-pre-line text-xs text-foreground">{feedbackText}</p>
      )}
    </div>
  );
}
