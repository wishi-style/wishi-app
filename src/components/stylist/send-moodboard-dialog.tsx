"use client";

// Save-and-send dialog for moodboards. Renders the asymmetric preview,
// auto-drafts an AI note (stub — Phase 7 will plug in the real LLM), lets
// the stylist edit, and calls onSend with the final note.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { MoodBoardGrid } from "./moodboard-grid";
import { SendIcon, SparklesIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: { id: string; url: string }[];
  clientName: string;
  onSend: (note: string) => Promise<void> | void;
}

const aiSuggestions = [
  "I chose earthy tones and relaxed silhouettes that match your preference for effortless elegance. Each piece can be mixed and matched to create multiple outfits.",
  "These picks reflect the minimalist aesthetic you mentioned — clean lines, neutral palette, quality fabrics. Versatile staples that transition seamlessly from day to evening.",
  "I curated bold statement pieces paired with versatile basics for maximum outfit combinations. The color palette ties back to the warm tones you gravitated toward in your style quiz.",
];

export function SendMoodBoardDialog({
  open,
  onOpenChange,
  images,
  clientName,
  onSend,
}: Props) {
  const [note, setNote] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open && !note) {
      setIsGenerating(true);
      const suggestion =
        aiSuggestions[Math.floor(Math.random() * aiSuggestions.length)];
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSend() {
    if (!note.trim()) {
      toast.error("Add a personal note before sending");
      return;
    }
    setSending(true);
    try {
      await onSend(note.trim());
      setNote("");
      onOpenChange(false);
    } finally {
      setSending(false);
    }
  }

  function handleClose(value: boolean) {
    if (!value) setNote("");
    onOpenChange(value);
  }

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

        <div className="px-6">
          <div className="rounded-sm border border-border overflow-hidden aspect-[3/2] max-h-[200px]">
            <MoodBoardGrid images={images} className="h-full" />
          </div>
          <p className="font-body text-[11px] text-muted-foreground mt-1.5 mb-4">
            {images.length} image{images.length !== 1 ? "s" : ""} selected
          </p>
        </div>

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
            disabled={!note.trim() || isGenerating || sending}
            size="sm"
            className="h-8 rounded-sm bg-foreground text-background hover:bg-foreground/90 font-body text-xs gap-1.5"
          >
            <SendIcon className="h-3.5 w-3.5" />
            {sending ? "Sending…" : `Send to ${clientName}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
