"use client";

import * as React from "react";
import { toast } from "sonner";
import { HeartIcon, XIcon, RefreshCcwIcon } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { RestyleWizard, type RestyleFeedback } from "./restyle-wizard";
import { cn } from "@/lib/utils";

export type StyleBoardItem = {
  /** BoardItem.id */
  id: string;
  name: string;
  brand: string;
  imageUrl: string | null;
  priceInCents?: number | null;
  inventoryProductId?: string | null;
};

export type StyleBoardRating = "LOVE" | "REVISE" | "NOT_MY_STYLE";

export interface StyleBoardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: string;
  title?: string;
  items: StyleBoardItem[];
  rating?: StyleBoardRating | null;
  /** When a product tile is clicked, open the product dialog. */
  onSelectItem?: (item: StyleBoardItem) => void;
  onRated?: (rating: StyleBoardRating) => void;
}

/**
 * Styleboard viewer with Love / Revise / Not My Style.
 *
 * - LOVE / NOT_MY_STYLE → POST `/api/styleboards/[id]/feedback` directly.
 * - REVISE → opens RestyleWizard; wizard's onSubmit is called once per
 *   selected item with the canonical `{ reasons, note }` shape which we
 *   POST to the same endpoint plus the item-level feedback payload.
 */
export function StyleBoardDialog({
  open,
  onOpenChange,
  boardId,
  title,
  items,
  rating,
  onSelectItem,
  onRated,
}: StyleBoardDialogProps) {
  const [submitting, setSubmitting] = React.useState<StyleBoardRating | null>(
    null,
  );
  const [currentRating, setCurrentRating] = React.useState<
    StyleBoardRating | null | undefined
  >(rating);
  const [wizardOpen, setWizardOpen] = React.useState(false);

  React.useEffect(() => {
    setCurrentRating(rating);
  }, [rating, open]);

  const formatPrice = (cents?: number | null) =>
    cents == null ? null : `$${Math.round(cents / 100)}`;

  const postRating = async (
    next: StyleBoardRating,
    body?: Record<string, unknown>,
  ) => {
    const res = await fetch(`/api/styleboards/${boardId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: next, ...(body ?? {}) }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error ?? "Couldn't save feedback");
    }
  };

  const rateSimple = async (next: "LOVE" | "NOT_MY_STYLE") => {
    if (submitting) return;
    setSubmitting(next);
    try {
      await postRating(next);
      setCurrentRating(next);
      onRated?.(next);
      toast.success(
        next === "LOVE"
          ? "Loved the look"
          : "Noted — your stylist will try again",
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(null);
    }
  };

  const submitRevise = async (feedback: RestyleFeedback) => {
    setSubmitting("REVISE");
    try {
      await postRating("REVISE", {
        perItemFeedback: Object.entries(feedback).map(([itemId, v]) => ({
          itemId,
          reasons: v.reasons,
          note: v.note,
        })),
      });
      setCurrentRating("REVISE");
      onRated?.("REVISE");
      toast.success("Sent to your stylist");
      setWizardOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
      throw err;
    } finally {
      setSubmitting(null);
    }
  };

  const canRate = currentRating == null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-border">
            <div>
              <p className="text-xs uppercase tracking-widest text-dark-taupe">
                Styleboard
              </p>
              <h2 className="font-display text-xl">
                {title ?? "Your stylist's look"}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
              className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[65vh] overflow-y-auto p-5">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onSelectItem?.(it)}
                  className="text-left group"
                >
                  {it.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.imageUrl}
                      alt={it.name}
                      className="w-full aspect-[3/4] object-cover rounded-lg bg-muted transition-transform group-hover:scale-[1.01]"
                    />
                  ) : (
                    <div className="w-full aspect-[3/4] rounded-lg bg-muted" />
                  )}
                  <p className="mt-2 text-xs uppercase tracking-widest text-dark-taupe truncate">
                    {it.brand}
                  </p>
                  <p className="text-sm truncate">{it.name}</p>
                  {formatPrice(it.priceInCents) ? (
                    <p className="text-sm text-muted-foreground">
                      {formatPrice(it.priceInCents)}
                    </p>
                  ) : null}
                </button>
              ))}
            </div>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">
                This styleboard is empty.
              </p>
            ) : null}
          </div>

          {canRate ? (
            <div className="p-4 flex flex-wrap items-center justify-end gap-2 border-t border-border">
              <button
                type="button"
                onClick={() => rateSimple("NOT_MY_STYLE")}
                disabled={!!submitting}
                className="inline-flex h-10 items-center rounded-full border border-border px-5 text-sm hover:bg-muted disabled:opacity-50 transition-colors"
              >
                {submitting === "NOT_MY_STYLE" ? "Sending…" : "Not my style"}
              </button>
              <button
                type="button"
                onClick={() => setWizardOpen(true)}
                disabled={!!submitting}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-foreground px-5 text-sm hover:bg-muted disabled:opacity-50 transition-colors"
              >
                <RefreshCcwIcon className="h-4 w-4" />
                Revise
              </button>
              <button
                type="button"
                onClick={() => rateSimple("LOVE")}
                disabled={!!submitting}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50 transition-colors"
              >
                <HeartIcon className="h-4 w-4" />
                {submitting === "LOVE" ? "Saving…" : "Love it"}
              </button>
            </div>
          ) : (
            <div
              className={cn(
                "p-4 border-t border-border text-center text-xs",
                currentRating === "LOVE"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {currentRating === "LOVE"
                ? "You loved this look."
                : currentRating === "REVISE"
                  ? "You sent revision notes — a revised look is on the way."
                  : "You told your stylist this isn't quite right."}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <RestyleWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        products={items.map((it) => ({
          id: it.id,
          name: it.name,
          brand: it.brand,
          imageUrl: it.imageUrl,
          priceInCents: it.priceInCents,
        }))}
        onSubmit={submitRevise}
      />
    </>
  );
}
