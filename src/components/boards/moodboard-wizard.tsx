"use client";

import * as React from "react";
import { toast } from "sonner";
import { ArrowLeftIcon, CheckIcon } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type MoodBoardWizardPhoto = {
  /** MoodboardPhoto.id — /api/ai/suggested-feedback/[id] accepts either a BoardItem or Photo id */
  id: string;
  imageUrl: string;
  caption?: string | null;
};

export type MoodBoardWizardFeedback = Record<
  string,
  { reasons: string[]; note: string }
>;

export interface MoodBoardWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photos: MoodBoardWizardPhoto[];
  onSubmit?: (feedback: MoodBoardWizardFeedback) => Promise<void> | void;
}

/**
 * Per-photo moodboard feedback wizard. Mirrors RestyleWizard two-step UX —
 * step 1 picks which photos to critique, step 2 walks through each with a
 * reason-chip row (fetched from `/api/ai/suggested-feedback/[photoId]`
 * which returns a canned 6-pill set in phase 10) plus a free-text note.
 *
 * Called from MoodBoardDialog when the client wants to give per-image
 * direction before the stylist produces the first styleboard.
 */
export function MoodBoardWizard({
  open,
  onOpenChange,
  photos,
  onSubmit,
}: MoodBoardWizardProps) {
  const [step, setStep] = React.useState<"select" | "feedback">("select");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [currentIdx, setCurrentIdx] = React.useState(0);
  const [feedback, setFeedback] = React.useState<MoodBoardWizardFeedback>({});
  const [pillsByPhoto, setPillsByPhoto] = React.useState<
    Record<string, string[] | undefined>
  >({});
  const [pillsLoading, setPillsLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const selectedPhotos = React.useMemo(
    () => photos.filter((p) => selectedIds.has(p.id)),
    [photos, selectedIds],
  );
  const currentPhoto = selectedPhotos[currentIdx] ?? null;
  const currentFeedback = currentPhoto
    ? feedback[currentPhoto.id] ?? { reasons: [], note: "" }
    : { reasons: [], note: "" };
  const currentPills = currentPhoto ? pillsByPhoto[currentPhoto.id] : undefined;

  React.useEffect(() => {
    if (!currentPhoto) return;
    if (pillsByPhoto[currentPhoto.id]) return;
    let cancelled = false;
    setPillsLoading(true);
    fetch(`/api/ai/suggested-feedback/${currentPhoto.id}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data: { pills?: string[] }) => {
        if (cancelled) return;
        setPillsByPhoto((prev) => ({
          ...prev,
          [currentPhoto.id]: data.pills ?? [],
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setPillsByPhoto((prev) => ({ ...prev, [currentPhoto.id]: [] }));
      })
      .finally(() => {
        if (!cancelled) setPillsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentPhoto, pillsByPhoto]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === photos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(photos.map((p) => p.id)));
    }
  };

  const toggleReason = (reason: string) => {
    if (!currentPhoto) return;
    setFeedback((prev) => {
      const existing = prev[currentPhoto.id] ?? { reasons: [], note: "" };
      const reasons = existing.reasons.includes(reason)
        ? existing.reasons.filter((r) => r !== reason)
        : [...existing.reasons, reason];
      return { ...prev, [currentPhoto.id]: { ...existing, reasons } };
    });
  };

  const setNote = (note: string) => {
    if (!currentPhoto) return;
    setFeedback((prev) => ({
      ...prev,
      [currentPhoto.id]: {
        reasons: prev[currentPhoto.id]?.reasons ?? [],
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
    if (!currentPhoto) return;
    if (currentIdx < selectedPhotos.length - 1) {
      setCurrentIdx((i) => i + 1);
      return;
    }
    const payload = opts.skip
      ? { ...feedback, [currentPhoto.id]: { reasons: [], note: "" } }
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
    setTimeout(() => {
      setStep("select");
      setSelectedIds(new Set());
      setCurrentIdx(0);
      setFeedback({});
      setPillsByPhoto({});
    }, 150);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : close())}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        {step === "select" ? (
          <>
            <div className="p-6 pb-4">
              <h2 className="font-display text-2xl">Guide your stylist</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Pick the images you want to talk about.
              </p>
            </div>
            <ScrollArea className="max-h-[60vh] border-t border-border">
              <div className="grid grid-cols-2 gap-2 p-4">
                {photos.map((p) => {
                  const checked = selectedIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleSelect(p.id)}
                      className={cn(
                        "relative rounded-lg overflow-hidden border transition-colors",
                        checked ? "border-foreground" : "border-border",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.imageUrl}
                        alt={p.caption ?? ""}
                        className="w-full aspect-[3/4] object-cover bg-muted"
                      />
                      <span
                        className={cn(
                          "absolute top-2 right-2 h-6 w-6 rounded-full border flex items-center justify-center transition-colors",
                          checked
                            ? "border-foreground bg-foreground text-background"
                            : "border-white bg-white/80 text-transparent",
                        )}
                      >
                        {checked ? <CheckIcon className="h-3.5 w-3.5" /> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
            <div className="p-4 flex items-center justify-between gap-2 border-t border-border">
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
              >
                {selectedIds.size === photos.length ? "Clear all" : "Select all"}
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
        ) : currentPhoto ? (
          <>
            <div className="p-6 pb-3 flex items-center gap-3">
              {currentIdx > 0 ? (
                <button
                  type="button"
                  onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                  aria-label="Previous photo"
                  className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center"
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                </button>
              ) : null}
              <div className="flex-1 min-w-0">
                <p className="text-xs uppercase tracking-widest text-dark-taupe">
                  Image {currentIdx + 1} of {selectedPhotos.length}
                </p>
              </div>
            </div>
            <div className="px-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentPhoto.imageUrl}
                alt={currentPhoto.caption ?? ""}
                className="w-full aspect-[4/5] object-cover rounded-lg bg-muted"
              />
            </div>
            <div className="p-6 pt-4 space-y-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
                  What speaks to you?
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
                  placeholder="e.g. this color palette, but a longer length"
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
                {currentIdx < selectedPhotos.length - 1
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
