"use client";

// Save & send dialog for the LookCreator. Mirrors LookCreator.tsx@19f4732
// :2107-2241 — required `lookName` (max 80) + required `description`
// (max 600), optional Event / Body type / Fit / Highlights tag inputs
// with a live chip preview. Title text "Save look for {clientName}",
// footer button "Save & send".

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
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

const NAME_MAX = 80;
const DESC_MAX = 600;
const TAG_MAX = 60;

export function SaveLookDialog({ open, onOpenChange, clientName, onSend }: Props) {
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [event, setEvent] = useState("");
  const [bodyType, setBodyType] = useState("");
  const [fitPreference, setFitPreference] = useState("");
  const [highlights, setHighlights] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameValid = title.trim().length > 0;
  const descValid = description.trim().length > 0;

  // Live tag chip preview — exactly the values we'll persist.
  const tagChips = useMemo(
    () =>
      [event, bodyType, fitPreference, highlights]
        .map((t) => t.trim())
        .filter(Boolean),
    [event, bodyType, fitPreference, highlights],
  );

  async function handleSend() {
    setError(null);
    setTitleTouched(true);
    setDescriptionTouched(true);
    if (!nameValid || !descValid) return;
    setSending(true);
    try {
      await onSend({
        title: title.trim(),
        description: description.trim(),
        tags: tagChips,
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

  const showNameError = titleTouched && !nameValid;
  const showDescError = descriptionTouched && !descValid;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-[520px] rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            Save look for {clientName}
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
              <span className="text-red-600 ml-0.5" aria-hidden>
                *
              </span>
            </Label>
            <Input
              id="lc-name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setTitleTouched(true)}
              placeholder="e.g. Sunday brunch capsule"
              maxLength={NAME_MAX}
              aria-invalid={showNameError || undefined}
              className={cn(
                "rounded-sm font-body text-sm",
                showNameError && "border-red-500 focus-visible:ring-red-500/40",
              )}
            />
            <div className="flex items-center justify-between mt-1">
              {showNameError ? (
                <p className="font-body text-[11px] text-red-600">
                  Look name is required.
                </p>
              ) : (
                <span />
              )}
              <p className="font-body text-[11px] text-muted-foreground">
                {title.length}/{NAME_MAX}
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="lc-desc" className="font-body text-xs mb-1.5">
              Description
              <span className="text-red-600 ml-0.5" aria-hidden>
                *
              </span>
            </Label>
            <Textarea
              id="lc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => setDescriptionTouched(true)}
              placeholder="Why this look? What's the occasion or mood?"
              maxLength={DESC_MAX}
              aria-invalid={showDescError || undefined}
              className={cn(
                "rounded-sm font-body text-sm min-h-[90px] resize-none",
                showDescError && "border-red-500 focus-visible:ring-red-500/40",
              )}
            />
            <div className="flex items-center justify-between mt-1">
              {showDescError ? (
                <p className="font-body text-[11px] text-red-600">
                  Description is required.
                </p>
              ) : (
                <span />
              )}
              <p className="font-body text-[11px] text-muted-foreground">
                {description.length}/{DESC_MAX}
              </p>
            </div>
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
                maxLength={TAG_MAX}
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
                maxLength={TAG_MAX}
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
                maxLength={TAG_MAX}
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
                maxLength={TAG_MAX}
                className="rounded-sm font-body text-sm"
              />
            </div>
          </div>

          {tagChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-body text-[11px] text-muted-foreground">
                Tags:
              </span>
              {tagChips.map((t, i) => (
                <Badge
                  key={`${t}-${i}`}
                  variant="secondary"
                  className="font-body text-[11px] rounded-sm"
                >
                  {t}
                </Badge>
              ))}
            </div>
          )}

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
            disabled={sending}
            size="sm"
            className="h-8 rounded-sm bg-foreground text-background hover:bg-foreground/90 font-body text-xs gap-1.5"
          >
            {sending ? (
              <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <SendIcon className="h-3.5 w-3.5" />
            )}
            {sending ? "Sending…" : "Save & send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
