"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { XIcon, ChevronLeftIcon } from "lucide-react";
const mood1 = "/loveable-assets/mood-1.jpg";
const mood2 = "/loveable-assets/mood-2.jpg";
const mood3 = "/loveable-assets/mood-3.jpg";
const mood4 = "/loveable-assets/mood-4.jpg";
const mood5 = "/loveable-assets/mood-5.jpg";
const mood6 = "/loveable-assets/mood-6.jpg";

const defaultImages = [mood1, mood2, mood3, mood4, mood5, mood6];

const feedbackOptions = [
  "Would wear",
  "Not my style",
  "I have something similar",
  "Doesn't fit my body type",
  "Love the vibe",
  "Too casual",
  "Too dressy",
];

interface MoodBoardWizardProps {
  images?: string[];
  initialFeedback?: Record<number, string[]>;
  onComplete?: (feedback: Record<number, string[]>) => void;
  onClose?: () => void;
}

export function MoodBoardWizard({
  images = defaultImages,
  initialFeedback,
  onComplete,
  onClose,
}: MoodBoardWizardProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedback, setFeedback] = useState<Record<number, string[]>>(initialFeedback ?? {});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [showMore, setShowMore] = useState(false);

  const total = images.length;
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

  const handleNext = () => {
    if (currentIndex < total - 1) {
      setCurrentIndex((i) => i + 1);
      setShowMore(false);
    } else {
      onComplete?.(feedback);
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setShowMore(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-md mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <button
            onClick={currentIndex > 0 ? handleBack : onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <span className="text-sm font-body text-muted-foreground">
            {currentIndex + 1} of {total}
          </span>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <h3 className="font-display text-xl mb-5">
            What do you think about this style?
          </h3>

          <div className="mb-6">
            <Image
              src={images[currentIndex]}
              alt={`Style ${currentIndex + 1}`}
              width={192}
              height={256}
              unoptimized
              className="w-48 h-auto rounded-sm object-cover"
            />
          </div>

          <p className="text-sm text-muted-foreground font-body mb-3">
            Check any that apply:
          </p>

          <div className="flex flex-wrap gap-2 mb-3">
            {visibleOptions.map((option) => (
              <button
                key={option}
                onClick={() => toggleOption(option)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-body border transition-colors",
                  selected.includes(option)
                    ? "bg-foreground text-background border-foreground"
                    : "bg-transparent text-foreground border-border hover:border-foreground"
                )}
              >
                {option}
              </button>
            ))}
          </div>

          {!showMore && feedbackOptions.length > 4 && (
            <button
              onClick={() => setShowMore(true)}
              className="text-sm font-body font-medium text-foreground hover:text-muted-foreground transition-colors"
            >
              Show More
            </button>
          )}

          <textarea
            placeholder="Add a note (optional)"
            value={notes[currentIndex] || ""}
            onChange={(e) => setNotes((prev) => ({ ...prev, [currentIndex]: e.target.value }))}
            className="w-full mt-4 px-4 py-3 rounded-lg border border-border bg-transparent font-body text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            rows={2}
          />
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border">
          <Button
            onClick={handleNext}
            className="w-full rounded-lg py-5 font-body text-sm"
          >
            {currentIndex < total - 1 ? "Next" : "Done"}
          </Button>
        </div>
      </div>
    </div>
  );
}
