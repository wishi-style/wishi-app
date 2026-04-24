"use client";

// Save & send dialog for the LookCreator — collects name, description,
// and free-form tags (event, body-type, fit, highlights).

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { SendIcon, Loader2Icon } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string;
  onSend: (input: {
    title: string;
    description: string;
    tags: string[];
  }) => Promise<void>;
}

export function SaveLookDialog({ open, onOpenChange, clientName, onSend }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [event, setEvent] = useState("");
  const [bodyType, setBodyType] = useState("");
  const [fitPreference, setFitPreference] = useState("");
  const [highlights, setHighlights] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameValid = title.trim().length >= 2;
  const descValid = description.trim().length >= 10;

  async function handleSend() {
    setError(null);
    if (!nameValid || !descValid) return;
    const tags = [event, bodyType, fitPreference, highlights]
      .map((t) => t.trim())
      .filter(Boolean);
    setSending(true);
    try {
      await onSend({
        title: title.trim(),
        description: description.trim(),
        tags,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  function close(value: boolean) {
    if (!sending) onOpenChange(value);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-[520px] rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            Save &amp; send look to {clientName}
          </DialogTitle>
          <DialogDescription className="font-body text-sm text-muted-foreground">
            Give this look a name and a short note. Tags are optional but
            help the client understand your direction.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="lc-name" className="font-body text-xs mb-1.5">
              Look name
            </Label>
            <Input
              id="lc-name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sunday brunch capsule"
              maxLength={80}
              className="rounded-sm font-body text-sm"
            />
          </div>

          <div>
            <Label htmlFor="lc-desc" className="font-body text-xs mb-1.5">
              Description
            </Label>
            <Textarea
              id="lc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Why this look? What's the occasion or mood?"
              maxLength={600}
              className="rounded-sm font-body text-sm min-h-[90px] resize-none"
            />
            <p className="font-body text-[11px] text-muted-foreground mt-1">
              {description.length}/600
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="lc-event" className="font-body text-xs mb-1.5">
                Event / occasion
              </Label>
              <Input
                id="lc-event"
                value={event}
                onChange={(e) => setEvent(e.target.value)}
                placeholder="e.g. brunch"
                maxLength={60}
                className="rounded-sm font-body text-sm"
              />
            </div>
            <div>
              <Label htmlFor="lc-body" className="font-body text-xs mb-1.5">
                Body type
              </Label>
              <Input
                id="lc-body"
                value={bodyType}
                onChange={(e) => setBodyType(e.target.value)}
                placeholder="e.g. pear"
                maxLength={60}
                className="rounded-sm font-body text-sm"
              />
            </div>
            <div>
              <Label htmlFor="lc-fit" className="font-body text-xs mb-1.5">
                Fit preference
              </Label>
              <Input
                id="lc-fit"
                value={fitPreference}
                onChange={(e) => setFitPreference(e.target.value)}
                placeholder="e.g. relaxed"
                maxLength={60}
                className="rounded-sm font-body text-sm"
              />
            </div>
            <div>
              <Label htmlFor="lc-high" className="font-body text-xs mb-1.5">
                Highlights
              </Label>
              <Input
                id="lc-high"
                value={highlights}
                onChange={(e) => setHighlights(e.target.value)}
                placeholder="e.g. waistline"
                maxLength={60}
                className="rounded-sm font-body text-sm"
              />
            </div>
          </div>
          {error && <p className="font-body text-xs text-red-600">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => close(false)}
            className="font-body text-xs h-8 rounded-sm"
          >
            Keep editing
          </Button>
          <Button
            onClick={handleSend}
            disabled={!nameValid || !descValid || sending}
            size="sm"
            className="h-8 rounded-sm bg-foreground text-background hover:bg-foreground/90 font-body text-xs gap-1.5"
          >
            {sending ? (
              <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <SendIcon className="h-3.5 w-3.5" />
            )}
            {sending ? "Sending…" : `Send to ${clientName}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
