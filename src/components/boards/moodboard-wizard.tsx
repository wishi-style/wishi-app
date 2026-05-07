"use client";

import { useState } from "react";
import { ChevronLeftIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Verbatim port of smart-spark-craft/src/components/MoodBoardWizard.tsx
// (HEAD on origin/main). Walks the user through every moodboard image one
// at a time, collecting chip selections + an optional note per image. The
// moodboard card maps the result onto a single Board.rating + feedbackText
// + feedbackDetail JSON for persistence.

const feedbackOptions = [
  "Would wear",
  "Not my style",
  "I have something similar",
  "Doesn't fit my body type",
  "Love the vibe",
  "Too casual",
  "Too dressy",
];

export interface MoodBoardWizardProps {
  open: boolean;
  images: string[];
  initialFeedback?: Record<number, string[]>;
  initialNotes?: Record<number, string>;
  onClose: () => void;
  onComplete: (
    feedback: Record<number, string[]>,
    notes: Record<number, string>,
  ) => void | Promise<void>;
}

export function MoodBoardWizard({
  open,
  images,
  initialFeedback,
  initialNotes,
  onClose,
  onComplete,
}: MoodBoardWizardProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedback, setFeedback] = useState<Record<number, string[]>>(
    initialFeedback ?? {},
  );
  const [notes, setNotes] = useState<Record<number, string>>(
    initialNotes ?? {},
  );
  const [showMore, setShowMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;
  const total = images.length;
  if (total === 0) return null;
  const selected = feedback[currentIndex] || [];
  const visibleOptions = showMore ? feedbackOptions : feedbackOptions.slice(0, 4);

  const toggleOption = (option: string) => {
    setFeedback((prev) => {
      const current = prev[currentIndex] || [];
      const updated = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      return { ...prev, [currentIndex]: updated };
    });
  };

  const handleNext = async () => {
    if (currentIndex < total - 1) {
      setCurrentIndex((i) => i + 1);
      setShowMore(false);
      return;
    }
    setSubmitting(true);
    try {
      await onComplete(feedback, notes);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setShowMore(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Review moodboard"
    >
      <div className="mx-4 flex max-h-[90vh] w-full max-w-md flex-col rounded-lg border border-border bg-card shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <button
            onClick={currentIndex > 0 ? handleBack : onClose}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label={currentIndex > 0 ? "Previous image" : "Close"}
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <span className="font-body text-sm text-muted-foreground">
            {currentIndex + 1} of {total}
          </span>
          <button
            onClick={onClose}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Close"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <h3 className="mb-5 font-heading text-xl">
            What do you think about this style?
          </h3>

          <div className="mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[currentIndex]}
              alt={`Style ${currentIndex + 1}`}
              className="h-auto w-48 rounded-sm object-cover"
            />
          </div>

          <p className="mb-3 font-body text-sm text-muted-foreground">
            Check any that apply:
          </p>

          <div className="mb-3 flex flex-wrap gap-2">
            {visibleOptions.map((option) => (
              <button
                key={option}
                onClick={() => toggleOption(option)}
                className={cn(
                  "rounded-full border px-4 py-2 font-body text-sm transition-colors",
                  selected.includes(option)
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-transparent text-foreground hover:border-foreground",
                )}
              >
                {option}
              </button>
            ))}
          </div>

          {!showMore && feedbackOptions.length > 4 && (
            <button
              onClick={() => setShowMore(true)}
              className="font-body text-sm font-medium text-foreground transition-colors hover:text-muted-foreground"
            >
              Show More
            </button>
          )}

          <textarea
            placeholder="Add a note (optional)"
            value={notes[currentIndex] || ""}
            onChange={(e) =>
              setNotes((prev) => ({ ...prev, [currentIndex]: e.target.value }))
            }
            className="mt-4 w-full resize-none rounded-lg border border-border bg-transparent px-4 py-3 font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            rows={2}
          />
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-4">
          <Button
            onClick={handleNext}
            disabled={submitting}
            className="w-full rounded-lg py-5 font-body text-sm"
          >
            {submitting
              ? "Saving…"
              : currentIndex < total - 1
                ? "Next"
                : "Done"}
          </Button>
        </div>
      </div>
    </div>
  );
}
