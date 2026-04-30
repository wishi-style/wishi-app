"use client";

import * as React from "react";
import { toast } from "sonner";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type RestyleProduct = {
  /** BoardItem.id — what the styleboard service references when persisting feedback. */
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
  /** Called once with all per-product feedback when the wizard submits. */
  onSubmit?: (feedback: RestyleFeedback) => Promise<void> | void;
}

/**
 * Loveable-port of `wishi-reimagined/src/components/RestyleWizard.tsx@19f4732`.
 *
 * Two-step modal:
 *   1) "Restyle Items" — 3-column grid of product tiles. Tap to toggle each
 *      piece that needs a revision; "Select All" / "Deselect All" header
 *      toggle.
 *   2) "Add Feedback" — for each selected item, pick from 7 hardcoded
 *      reason chips and add an optional note. Submit on the final item.
 *
 * Loveable hardcodes the chip vocabulary; staging mirrors that. The AI
 * suggested-pill endpoint (`/api/ai/suggested-feedback/[boardItemId]`) is
 * Phase 7 territory and stays unrouted from here per "Mirror, not
 * paraphrase".
 */
const FEEDBACK_CHIPS = [
  "Over my budget",
  "I have something similar",
  "Wrong color",
  "Not my style",
  "Too bold",
  "Too structured for me",
  "Prefer a different length",
] as const;

function formatPrice(priceInCents: number | null | undefined): string {
  if (priceInCents == null) return "";
  return `$${Math.round(priceInCents / 100)}`;
}

export function RestyleWizard({
  open,
  onOpenChange,
  products,
  onSubmit,
}: RestyleWizardProps) {
  const [step, setStep] = React.useState<"select" | "feedback">("select");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [currentFeedbackIdx, setCurrentFeedbackIdx] = React.useState(0);
  const [feedback, setFeedback] = React.useState<RestyleFeedback>({});
  const [submitting, setSubmitting] = React.useState(false);

  const selectedProducts = products.filter((p) => selectedIds.has(p.id));
  const currentProduct = selectedProducts[currentFeedbackIdx];
  const currentFeedback = currentProduct
    ? feedback[currentProduct.id] || { reasons: [], note: "" }
    : { reasons: [], note: "" };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map((p) => p.id)));
    }
  };

  const goToFeedback = () => {
    if (selectedIds.size === 0) return;
    setCurrentFeedbackIdx(0);
    setStep("feedback");
  };

  const toggleChip = (chip: string) => {
    if (!currentProduct) return;
    setFeedback((prev) => {
      const existing = prev[currentProduct.id] || { reasons: [], note: "" };
      const reasons = existing.reasons.includes(chip)
        ? existing.reasons.filter((r) => r !== chip)
        : [...existing.reasons, chip];
      return { ...prev, [currentProduct.id]: { ...existing, reasons } };
    });
  };

  const setNote = (note: string) => {
    if (!currentProduct) return;
    setFeedback((prev) => {
      const existing = prev[currentProduct.id] || { reasons: [], note: "" };
      return { ...prev, [currentProduct.id]: { ...existing, note } };
    });
  };

  const handleClose = () => {
    onOpenChange(false);
    // Defer reset until after dialog close transition.
    setTimeout(() => {
      setStep("select");
      setSelectedIds(new Set());
      setCurrentFeedbackIdx(0);
      setFeedback({});
    }, 300);
  };

  const submit = async (skipCurrent: boolean) => {
    const payload = skipCurrent && currentProduct
      ? { ...feedback, [currentProduct.id]: { reasons: [], note: "" } }
      : feedback;
    try {
      setSubmitting(true);
      await onSubmit?.(payload);
      handleClose();
    } catch (err) {
      toast.error((err as Error).message || "Couldn't send feedback");
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    if (currentFeedbackIdx < selectedProducts.length - 1) {
      setCurrentFeedbackIdx((i) => i + 1);
    } else {
      void submit(false);
    }
  };

  const handleSkip = () => {
    if (currentFeedbackIdx < selectedProducts.length - 1) {
      setCurrentFeedbackIdx((i) => i + 1);
    } else {
      void submit(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : handleClose())}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        {step === "select" && (
          <div className="flex flex-col h-[70vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="font-display text-lg">Restyle Items</h3>
              <button
                onClick={selectAll}
                className="text-sm font-body font-medium text-foreground hover:text-foreground/70 transition-colors"
              >
                {selectedIds.size === products.length ? "Deselect All" : "Select All"}
              </button>
            </div>

            <p className="px-6 pt-4 pb-2 text-sm font-body text-muted-foreground">
              Select the items you want to replace
            </p>

            {/* Product grid */}
            <ScrollArea className="flex-1 px-6">
              <div className="grid grid-cols-3 gap-3 pb-4">
                {products.map((product) => {
                  const isSelected = selectedIds.has(product.id);
                  return (
                    <button
                      key={product.id}
                      onClick={() => toggleSelect(product.id)}
                      className={cn(
                        "relative rounded-lg border-2 p-2 flex flex-col items-center transition-colors text-left",
                        isSelected
                          ? "border-foreground"
                          : "border-border hover:border-muted-foreground",
                      )}
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-foreground text-background flex items-center justify-center">
                          <Check className="h-3 w-3" />
                        </div>
                      )}
                      <div className="aspect-square w-full overflow-hidden rounded-sm mb-2 bg-muted">
                        {product.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.imageUrl}
                            alt={product.brand}
                            className="w-full h-full object-cover"
                          />
                        ) : null}
                      </div>
                      <p className="font-body text-xs font-medium text-foreground text-center truncate w-full">
                        {product.brand}
                      </p>
                      <p className="font-body text-xs text-foreground text-center">
                        {formatPrice(product.priceInCents)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border">
              <Button
                onClick={goToFeedback}
                disabled={selectedIds.size === 0}
                className="w-full rounded-lg bg-foreground text-background hover:bg-foreground/90 font-body"
              >
                Add Feedback
              </Button>
            </div>
          </div>
        )}

        {step === "feedback" && currentProduct && (
          <div className="flex flex-col h-[70vh]">
            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
              <button
                onClick={() => {
                  if (currentFeedbackIdx > 0) {
                    setCurrentFeedbackIdx((i) => i - 1);
                  } else {
                    setStep("select");
                  }
                }}
                className="text-foreground hover:text-foreground/70 transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h3 className="font-display text-lg">Add Feedback</h3>
            </div>

            <ScrollArea className="flex-1 px-6">
              {/* Progress */}
              <p className="text-sm font-body text-muted-foreground pt-4 pb-3 text-center">
                {currentFeedbackIdx + 1} of {selectedProducts.length} Items
              </p>

              {/* Product info */}
              <div className="flex items-start gap-4 mb-5">
                <div className="w-28 h-28 shrink-0 rounded-md overflow-hidden bg-white border border-border">
                  {currentProduct.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={currentProduct.imageUrl}
                      alt={currentProduct.brand}
                      className="w-full h-full object-cover"
                    />
                  ) : null}
                </div>
                <div>
                  <p className="font-body text-sm font-semibold text-foreground">{currentProduct.brand}</p>
                  <p className="font-body text-sm text-foreground">{formatPrice(currentProduct.priceInCents)}</p>
                </div>
              </div>

              {/* Feedback chips */}
              <div className="flex flex-wrap gap-2 mb-5">
                {FEEDBACK_CHIPS.map((chip) => {
                  const isActive = currentFeedback.reasons.includes(chip);
                  return (
                    <button
                      key={chip}
                      onClick={() => toggleChip(chip)}
                      className={cn(
                        "rounded-full px-4 py-2 text-sm font-body border transition-colors",
                        isActive
                          ? "bg-foreground text-background border-foreground"
                          : "bg-background text-foreground border-border hover:border-foreground",
                      )}
                    >
                      {chip}
                    </button>
                  );
                })}
              </div>

              {/* Free text */}
              <textarea
                placeholder="Add a note (optional)..."
                value={currentFeedback.note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm font-body text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring resize-none mb-4"
              />
            </ScrollArea>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border space-y-2">
              <Button
                onClick={handleNext}
                disabled={submitting}
                className="w-full rounded-lg bg-foreground text-background hover:bg-foreground/90 font-body"
              >
                {currentFeedbackIdx < selectedProducts.length - 1
                  ? "Next"
                  : submitting
                    ? "Sending…"
                    : "Submit"}
              </Button>
              <Button
                variant="ghost"
                onClick={handleSkip}
                disabled={submitting}
                className="w-full rounded-lg font-body bg-background text-foreground hover:bg-background/80"
              >
                Skip
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
