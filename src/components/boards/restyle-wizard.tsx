"use client";

import * as React from "react";
import { toast } from "sonner";
import { ArrowLeftIcon, CheckIcon } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type RestyleProduct = {
  /** BoardItem.id — what /api/ai/suggested-feedback takes as path param */
  id: string;
  name: string;
  brand: string;
  imageUrl: string | null;
  priceInCents?: number | null;
};

export type RestyleFeedback = Record<string, { reasons: string[]; note: string }>;

export interface RestyleWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: RestyleProduct[];
  /** Called once per selected product when the wizard submits. */
  onSubmit?: (feedback: RestyleFeedback) => Promise<void> | void;
}

/**
 * Client wizard for "revise this look" feedback. Two steps:
 *   1) Select which items in the styleboard need a revision.
 *   2) For each selected item, pick 1+ reason chips + optional note.
 *
 * Phase 10: the reason-chip options are fetched from
 *   GET /api/ai/suggested-feedback/[boardItemId]
 * which returns category-aware canned pills in phase 10 and LLM-generated
 * pills when Phase 7 replaces the endpoint body. The consumer doesn't
 * change when that swap happens.
 */
export function RestyleWizard({
  open,
  onOpenChange,
  products,
  onSubmit,
}: RestyleWizardProps) {
  const [step, setStep] = React.useState<"select" | "feedback">("select");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [currentIdx, setCurrentIdx] = React.useState(0);
  const [feedback, setFeedback] = React.useState<RestyleFeedback>({});
  const [pillsByItem, setPillsByItem] = React.useState<
    Record<string, string[] | undefined>
  >({});
  const [pillsLoading, setPillsLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const selectedProducts = React.useMemo(
    () => products.filter((p) => selectedIds.has(p.id)),
    [products, selectedIds],
  );
  const currentProduct = selectedProducts[currentIdx] ?? null;
  const currentFeedback = currentProduct
    ? feedback[currentProduct.id] ?? { reasons: [], note: "" }
    : { reasons: [], note: "" };

  const currentPills = currentProduct
    ? pillsByItem[currentProduct.id]
    : undefined;

  // Fetch AI pills for the current item whenever we land on it.
  React.useEffect(() => {
    if (!currentProduct) return;
    if (pillsByItem[currentProduct.id]) return;
    let cancelled = false;
    setPillsLoading(true);
    fetch(`/api/ai/suggested-feedback/${currentProduct.id}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data: { pills?: string[] }) => {
        if (cancelled) return;
        setPillsByItem((prev) => ({
          ...prev,
          [currentProduct.id]: data.pills ?? [],
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setPillsByItem((prev) => ({ ...prev, [currentProduct.id]: [] }));
      })
      .finally(() => {
        if (!cancelled) setPillsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentProduct, pillsByItem]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map((p) => p.id)));
    }
  };

  const toggleReason = (reason: string) => {
    if (!currentProduct) return;
    setFeedback((prev) => {
      const existing = prev[currentProduct.id] ?? { reasons: [], note: "" };
      const reasons = existing.reasons.includes(reason)
        ? existing.reasons.filter((r) => r !== reason)
        : [...existing.reasons, reason];
      return { ...prev, [currentProduct.id]: { ...existing, reasons } };
    });
  };

  const setNote = (note: string) => {
    if (!currentProduct) return;
    setFeedback((prev) => ({
      ...prev,
      [currentProduct.id]: {
        reasons: prev[currentProduct.id]?.reasons ?? [],
        note,
      },
    }));
  };

  const goToFeedback = () => {
    if (selectedIds.size === 0) return;
    setCurrentIdx(0);
    setStep("feedback");
  };

  const advance = async (opts: { skip?: boolean } = {}) => {
    if (!currentProduct) return;
    if (currentIdx < selectedProducts.length - 1) {
      setCurrentIdx((i) => i + 1);
      return;
    }
    // Final item — submit.
    const payload = opts.skip
      ? { ...feedback, [currentProduct.id]: { reasons: [], note: "" } }
      : feedback;
    try {
      setSubmitting(true);
      await onSubmit?.(payload);
      close();
    } catch (err) {
      toast.error((err as Error).message || "Couldn't send feedback");
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    onOpenChange(false);
    // Defer reset until after dialog close transition.
    setTimeout(() => {
      setStep("select");
      setSelectedIds(new Set());
      setCurrentIdx(0);
      setFeedback({});
      setPillsByItem({});
    }, 150);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : close())}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        {step === "select" ? (
          <>
            <div className="p-6 pb-4">
              <h2 className="font-display text-2xl">Revise the look</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Pick the pieces that need another pass.
              </p>
            </div>
            <ScrollArea className="max-h-[60vh] border-t border-border">
              <ul className="p-4 space-y-2">
                {products.map((p) => {
                  const checked = selectedIds.has(p.id);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => toggleSelect(p.id)}
                        className={cn(
                          "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                          checked
                            ? "border-foreground bg-muted"
                            : "border-border hover:bg-muted/50",
                        )}
                      >
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            className="h-14 w-14 rounded-md object-cover bg-muted"
                          />
                        ) : (
                          <div className="h-14 w-14 rounded-md bg-muted" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs uppercase tracking-widest text-dark-taupe">
                            {p.brand}
                          </p>
                          <p className="text-sm truncate">{p.name}</p>
                        </div>
                        <span
                          className={cn(
                            "h-5 w-5 rounded-full border flex items-center justify-center transition-colors",
                            checked
                              ? "border-foreground bg-foreground text-background"
                              : "border-border",
                          )}
                        >
                          {checked ? <CheckIcon className="h-3 w-3" /> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
            <div className="p-4 flex items-center justify-between gap-2 border-t border-border">
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
              >
                {selectedIds.size === products.length
                  ? "Clear all"
                  : "Select all"}
              </button>
              <button
                type="button"
                onClick={goToFeedback}
                disabled={selectedIds.size === 0}
                className="inline-flex h-10 items-center rounded-full bg-foreground px-6 text-sm font-medium text-background disabled:opacity-50 hover:bg-foreground/90 transition-colors"
              >
                Next · {selectedIds.size}
              </button>
            </div>
          </>
        ) : currentProduct ? (
          <>
            <div className="p-6 pb-3 flex items-center gap-3">
              {currentIdx > 0 ? (
                <button
                  type="button"
                  onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                  aria-label="Previous item"
                  className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center"
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                </button>
              ) : null}
              <div className="flex-1 min-w-0">
                <p className="text-xs uppercase tracking-widest text-dark-taupe">
                  Item {currentIdx + 1} of {selectedProducts.length}
                </p>
                <p className="font-display text-lg truncate">
                  {currentProduct.name}
                </p>
              </div>
            </div>
            <div className="px-6">
              {currentProduct.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentProduct.imageUrl}
                  alt={currentProduct.name}
                  className="w-full aspect-[4/5] object-cover rounded-lg bg-muted"
                />
              ) : (
                <div className="w-full aspect-[4/5] rounded-lg bg-muted" />
              )}
            </div>
            <div className="p-6 pt-4 space-y-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
                  What&apos;s not working?
                </p>
                <div className="flex flex-wrap gap-2">
                  {pillsLoading && !currentPills ? (
                    <p className="text-xs text-muted-foreground">
                      Loading suggestions…
                    </p>
                  ) : (currentPills ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No suggestions — use the note below.
                    </p>
                  ) : (
                    (currentPills ?? []).map((reason) => {
                      const active = currentFeedback.reasons.includes(reason);
                      return (
                        <button
                          key={reason}
                          type="button"
                          onClick={() => toggleReason(reason)}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs transition-colors",
                            active
                              ? "border-foreground bg-foreground text-background"
                              : "border-border text-muted-foreground hover:border-foreground/50",
                          )}
                        >
                          {reason}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
                  Anything else? (optional)
                </p>
                <textarea
                  value={currentFeedback.note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. love the silhouette, want it in black"
                  className="w-full rounded-md border border-border bg-background p-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground min-h-[80px] resize-none"
                  maxLength={500}
                />
              </div>
            </div>
            <div className="p-4 flex items-center justify-between gap-2 border-t border-border">
              <button
                type="button"
                onClick={() => advance({ skip: true })}
                disabled={submitting}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 disabled:opacity-50"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={() => advance()}
                disabled={submitting}
                className="inline-flex h-10 items-center rounded-full bg-foreground px-6 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50 transition-colors"
              >
                {currentIdx < selectedProducts.length - 1
                  ? "Next"
                  : submitting
                    ? "Sending…"
                    : "Send to stylist"}
              </button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
