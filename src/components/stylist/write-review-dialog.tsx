"use client";

import { useState } from "react";
import { Star, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Props {
  stylistProfileId: string;
  stylistFirstName: string;
}

export function WriteReviewDialog({ stylistProfileId, stylistFirstName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/stylists/${stylistProfileId}/reviews`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating, reviewText: text }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Failed to submit review");
        return;
      }
      setOpen(false);
      setRating(0);
      setText("");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        className="rounded-full text-xs gap-1.5"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Pencil className="h-3.5 w-3.5" />
        Write a Review
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">
            Review {stylistFirstName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <p className="mb-2 text-sm text-stone-500">Rating</p>
            <div className="flex gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setRating(i + 1)}
                  aria-label={`${i + 1} star${i ? "s" : ""}`}
                >
                  <Star
                    className={cn(
                      "h-6 w-6 transition-colors",
                      i < rating
                        ? "fill-foreground text-foreground"
                        : "text-stone-300",
                    )}
                  />
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm text-stone-500">Your experience</p>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Share your styling experience..."
              className="min-h-[100px] text-sm"
              maxLength={5000}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button
            onClick={handleSubmit}
            disabled={
              submitting || rating === 0 || text.trim().length < 5
            }
            className="w-full rounded-full"
          >
            {submitting ? "Submitting…" : "Submit Review"}
          </Button>
        </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
