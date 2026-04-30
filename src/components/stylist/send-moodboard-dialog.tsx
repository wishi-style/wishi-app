"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { MoodBoardGrid } from "@/components/stylist/moodboard-grid";
import { SendIcon, SparklesIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

interface SendMoodBoardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: string[];
  clientName: string;
  onSend: (images: string[], note: string) => void;
}

const aiSuggestions = [
  "I chose earthy tones and relaxed silhouettes that match your preference for effortless elegance. Each piece can be mixed and matched to create multiple outfits — perfect for your upcoming travel plans.",
  "These picks reflect the minimalist aesthetic you mentioned — clean lines, neutral palette, quality fabrics. I focused on versatile staples that transition seamlessly from day to evening.",
  "I curated bold statement pieces paired with versatile basics for maximum outfit combinations. The color palette ties back to the warm tones you gravitated toward in your style quiz.",
];

export function SendMoodBoardDialog({
  open,
  onOpenChange,
  images,
  clientName,
  onSend,
}: SendMoodBoardDialogProps) {
  const [note, setNote] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Auto-generate AI suggestion when dialog opens
  useEffect(() => {
    if (open && !note) {
      setIsGenerating(true);
      const suggestion = aiSuggestions[Math.floor(Math.random() * aiSuggestions.length)];
      // Simulate AI generation with a typing effect
      let i = 0;
      const interval = setInterval(() => {
        setNote(suggestion.slice(0, i + 1));
        i++;
        if (i >= suggestion.length) {
          clearInterval(interval);
          setIsGenerating(false);
        }
      }, 12);
      return () => clearInterval(interval);
    }
  }, [open]);

  const handleSend = () => {
    if (!note.trim()) {
      toast.error("Add a personal note before sending");
      return;
    }
    onSend(images, note.trim());
    setNote("");
    onOpenChange(false);
  };

  const handleClose = (value: boolean) => {
    if (!value) setNote("");
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[560px] p-0 gap-0 rounded-sm overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="font-display text-lg">
            Send mood board to {clientName}
          </DialogTitle>
          <DialogDescription className="font-body text-sm text-muted-foreground">
            We drafted a personal note for you — edit it or send as-is.
          </DialogDescription>
        </DialogHeader>

        {/* Board preview */}
        <div className="px-6">
          <div className="rounded-sm border border-border overflow-hidden aspect-[3/2] max-h-[200px]">
            <MoodBoardGrid images={images} className="h-full" />
          </div>
          <p className="font-body text-[11px] text-muted-foreground mt-1.5 mb-4">
            {images.length} image{images.length !== 1 ? "s" : ""} selected
          </p>
        </div>

        {/* Note input */}
        <div className="px-6 pb-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            {isGenerating ? (
              <Loader2Icon className="h-3 w-3 text-accent animate-spin" />
            ) : (
              <SparklesIcon className="h-3 w-3 text-accent" />
            )}
            <label className="font-body text-xs font-medium text-foreground">
              {isGenerating ? "Drafting your note…" : "AI-drafted note"}
            </label>
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Tell your client why you picked these looks…"
            className="font-body text-sm rounded-sm resize-none min-h-[100px] focus-visible:ring-accent"
            maxLength={500}
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className="font-body text-[11px] text-muted-foreground">
              Edit freely — make it yours
            </span>
            <span className="font-body text-[11px] text-muted-foreground">
              {note.length}/500
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-muted/30">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleClose(false)}
            className="font-body text-xs h-8 rounded-sm"
          >
            Back to editing
          </Button>
          <Button
            onClick={handleSend}
            disabled={!note.trim() || isGenerating}
            size="sm"
            className="h-8 rounded-sm bg-foreground text-background hover:bg-foreground/90 font-body text-xs gap-1.5"
          >
            <SendIcon className="h-3.5 w-3.5" />
            Send to {clientName}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
