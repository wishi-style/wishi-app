"use client";

// Profile-mode save dialog for moodboards. Mirrors SaveLookDialog (title +
// description + tag inputs) so moodboards published to a stylist's profile
// carry the same metadata shape as styleboards.
//
// Used by MoodboardBuilder when `profileMode={true}` — no AI-drafted note
// (that's for the client-facing send flow), no feature toggle (the stylist
// is already on /stylist/profile/boards/new/moodboard), no style picker
// (the style label was chosen on the prior picker and travels via the
// query string).

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
  /** Style label this board will be filed under on the public profile. */
  profileStyle: string | null;
  onPublish: (input: {
    title: string;
    description: string;
    tags: string[];
  }) => Promise<void>;
}

const NAME_MAX = 80;
const DESC_MAX = 600;
const TAG_MAX = 60;

export function PublishMoodboardDialog({
  open,
  onOpenChange,
  profileStyle,
  onPublish,
}: Props) {
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [event, setEvent] = useState("");
  const [bodyType, setBodyType] = useState("");
  const [fitPreference, setFitPreference] = useState("");
  const [highlights, setHighlights] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameValid = title.trim().length > 0;
  const descValid = description.trim().length > 0;

  const tagChips = useMemo(
    () =>
      [event, bodyType, fitPreference, highlights]
        .map((t) => t.trim())
        .filter(Boolean),
    [event, bodyType, fitPreference, highlights],
  );

  async function handlePublish() {
    setError(null);
    setTitleTouched(true);
    setDescriptionTouched(true);
    if (!nameValid || !descValid) return;
    setPublishing(true);
    try {
      await onPublish({
        title: title.trim(),
        description: description.trim(),
        tags: tagChips,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  function close(value: boolean) {
    if (!publishing) onOpenChange(value);
  }

  const showNameError = titleTouched && !nameValid;
  const showDescError = descriptionTouched && !descValid;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-[520px] rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            Publish moodboard to your profile
          </DialogTitle>
          <DialogDescription className="font-body text-sm text-muted-foreground">
            {profileStyle ? (
              <>
                Filed under{" "}
                <span className="font-medium text-foreground">{profileStyle}</span>{" "}
                on your public stylist page.
              </>
            ) : (
              "Visible on your public stylist page."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="mb-name" className="font-body text-xs mb-1.5">
              Title
              <span className="text-red-600 ml-0.5" aria-hidden>
                *
              </span>
            </Label>
            <Input
              id="mb-name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setTitleTouched(true)}
              placeholder="e.g. Coastal grandma summer"
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
                  Title is required.
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
            <Label htmlFor="mb-desc" className="font-body text-xs mb-1.5">
              Description
              <span className="text-red-600 ml-0.5" aria-hidden>
                *
              </span>
            </Label>
            <Textarea
              id="mb-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => setDescriptionTouched(true)}
              placeholder="What's the mood? What kind of client is this for?"
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
              <Label htmlFor="mb-event" className="font-body text-xs mb-1.5">
                Event / occasion
              </Label>
              <Input
                id="mb-event"
                value={event}
                onChange={(e) => setEvent(e.target.value)}
                placeholder="e.g. beach trip"
                maxLength={TAG_MAX}
                className="rounded-sm font-body text-sm"
              />
            </div>
            <div>
              <Label htmlFor="mb-body" className="font-body text-xs mb-1.5">
                Body type
              </Label>
              <Input
                id="mb-body"
                value={bodyType}
                onChange={(e) => setBodyType(e.target.value)}
                placeholder="e.g. pear"
                maxLength={TAG_MAX}
                className="rounded-sm font-body text-sm"
              />
            </div>
            <div>
              <Label htmlFor="mb-fit" className="font-body text-xs mb-1.5">
                Fit preference
              </Label>
              <Input
                id="mb-fit"
                value={fitPreference}
                onChange={(e) => setFitPreference(e.target.value)}
                placeholder="e.g. relaxed"
                maxLength={TAG_MAX}
                className="rounded-sm font-body text-sm"
              />
            </div>
            <div>
              <Label htmlFor="mb-high" className="font-body text-xs mb-1.5">
                Highlights
              </Label>
              <Input
                id="mb-high"
                value={highlights}
                onChange={(e) => setHighlights(e.target.value)}
                placeholder="e.g. layering"
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
            disabled={publishing}
          >
            Keep editing
          </Button>
          <Button
            onClick={handlePublish}
            disabled={publishing}
            size="sm"
            className="h-8 rounded-sm bg-foreground text-background hover:bg-foreground/90 font-body text-xs gap-1.5"
          >
            {publishing ? (
              <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <SendIcon className="h-3.5 w-3.5" />
            )}
            {publishing ? "Publishing…" : "Publish to profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
