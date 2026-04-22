"use client";

import * as React from "react";
import { toast } from "sonner";
import { HeartIcon, XIcon } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type MoodBoardPhoto = {
  id: string;
  imageUrl: string;
  caption?: string | null;
};

export type MoodBoardRating = "LOVE" | "NOT_MY_STYLE";

export interface MoodBoardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: string;
  photos: MoodBoardPhoto[];
  /** Existing rating — hides the reaction bar when already rated. */
  rating?: MoodBoardRating | null;
  onRated?: (rating: MoodBoardRating) => void;
}

/**
 * Moodboard viewer + rating surface. Moodboards support only LOVE /
 * NOT_MY_STYLE (no Revise — that's a styleboard thing). Rating posts to
 * `/api/moodboards/[id]/feedback`.
 */
export function MoodBoardDialog({
  open,
  onOpenChange,
  boardId,
  photos,
  rating,
  onRated,
}: MoodBoardDialogProps) {
  const [submitting, setSubmitting] = React.useState<MoodBoardRating | null>(
    null,
  );
  const [currentRating, setCurrentRating] = React.useState<
    MoodBoardRating | null | undefined
  >(rating);

  React.useEffect(() => {
    setCurrentRating(rating);
  }, [rating, open]);

  const rate = async (next: MoodBoardRating) => {
    if (submitting) return;
    setSubmitting(next);
    try {
      const res = await fetch(`/api/moodboards/${boardId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Couldn't save feedback");
      }
      setCurrentRating(next);
      onRated?.(next);
      toast.success(
        next === "LOVE" ? "Loved it" : "Noted — your stylist will adjust",
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(null);
    }
  };

  const canRate = currentRating == null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <p className="text-xs uppercase tracking-widest text-dark-taupe">
              Moodboard
            </p>
            <h2 className="font-display text-xl">Your stylist&apos;s direction</h2>
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
          <div className="grid grid-cols-2 gap-3">
            {photos.map((photo) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={photo.id}
                src={photo.imageUrl}
                alt={photo.caption ?? ""}
                className="w-full aspect-[3/4] object-cover rounded-lg bg-muted"
              />
            ))}
          </div>
          {photos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              No photos on this moodboard yet.
            </p>
          ) : null}
        </div>

        {canRate ? (
          <div className="p-4 flex items-center justify-end gap-2 border-t border-border">
            <button
              type="button"
              onClick={() => rate("NOT_MY_STYLE")}
              disabled={!!submitting}
              className="inline-flex h-10 items-center rounded-full border border-border px-5 text-sm hover:bg-muted disabled:opacity-50 transition-colors"
            >
              {submitting === "NOT_MY_STYLE" ? "Sending…" : "Not my style"}
            </button>
            <button
              type="button"
              onClick={() => rate("LOVE")}
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
              ? "You loved this — your stylist is building your first look."
              : "You told your stylist this isn't quite right."}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
