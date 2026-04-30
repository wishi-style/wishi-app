"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { saveDraft, deleteDraft, type MoodBoardDraft } from "@/lib/moodBoardDrafts";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  ArrowLeftIcon,
  SearchIcon,
  PlusIcon,
  XIcon,
  ChevronDownIcon,
  SendIcon,
  Trash2Icon,
  UserIcon,
  SaveIcon,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MoodBoardGrid } from "@/components/stylist/moodboard-grid";
import {
  MoodBoardFreestyle,
  defaultFreestyleLayout,
  type FreestyleItem,
} from "@/components/stylist/moodboard-freestyle";
import { SendMoodBoardDialog } from "@/components/stylist/send-moodboard-dialog";
import ClientDetailPanel from "@/components/stylist/client-detail-panel";
import { toast } from "sonner";

interface InspirationPhoto {
  id: string;
  url: string;
  s3Key: string;
  title: string | null;
  category: string | null;
  tags: string[];
}

interface MoodBoardCreatorProps {
  clientName: string;
  sessionId?: string | null;
  draftId?: string | null;
  initialImages?: string[];
  onBack: () => void;
  onSend?: (images: string[], note: string) => void;
  onDraftSaved?: () => void;
  onPhotoAdded?: (input: { url: string; s3Key: string; inspirationPhotoId: string }) => Promise<boolean>;
  onPhotoRemoved?: (url: string) => Promise<void>;
}

export function MoodboardBuilder({ clientName, sessionId, draftId, initialImages, onBack, onSend, onDraftSaved, onPhotoAdded, onPhotoRemoved }: MoodBoardCreatorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [genderFilter, setGenderFilter] = useState("female");
  const [canvasImages, setCanvasImages] = useState<string[]>(initialImages || []);
  const [canvasMode, setCanvasMode] = useState<"template" | "freestyle">("template");
  const [freestyleItems, setFreestyleItems] = useState<FreestyleItem[]>([]);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [clientInfoOpen, setClientInfoOpen] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(draftId || null);
  const [inspirations, setInspirations] = useState<InspirationPhoto[]>([]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (genderFilter !== "all") params.set("category", genderFilter);
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    let cancelled = false;
    fetch(`/api/inspiration-photos?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : { photos: [] }))
      .then((body) => {
        if (!cancelled) setInspirations(body.photos ?? []);
      })
      .catch(() => {
        if (!cancelled) setInspirations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [genderFilter, searchQuery]);

  const resultCount = inspirations.length;

  // Re-flow freestyle items when entering freestyle mode or when images change while in freestyle.
  useEffect(() => {
    if (canvasMode !== "freestyle") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFreestyleItems((prev) => {
      const existing = new Map(prev.map((it) => [it.src, it]));
      const maxZ = Math.max(0, ...prev.map((it) => it.z));
      const defaults = defaultFreestyleLayout(canvasImages);
      let z = maxZ;
      return canvasImages.map((src, i) => {
        const found = existing.get(src);
        if (found) return found;
        z += 1;
        return { ...defaults[i], z };
      });
    });
  }, [canvasMode, canvasImages]);

  const addToCanvas = (photo: InspirationPhoto) => {
    if (canvasImages.includes(photo.url)) {
      toast("Already added to board");
      return;
    }
    if (canvasImages.length >= 9) {
      toast("Maximum 9 images per mood board");
      return;
    }
    setCanvasImages((prev) => [...prev, photo.url]);
    if (onPhotoAdded) {
      void onPhotoAdded({
        url: photo.url,
        s3Key: photo.s3Key,
        inspirationPhotoId: photo.id,
      }).then((ok) => {
        if (!ok) setCanvasImages((prev) => prev.filter((s) => s !== photo.url));
      });
    }
  };

  const removeFromCanvas = (index: number) => {
    const src = canvasImages[index];
    setCanvasImages((prev) => prev.filter((_, i) => i !== index));
    setFreestyleItems((prev) => prev.filter((it) => it.src !== src));
    if (onPhotoRemoved && src) void onPhotoRemoved(src);
  };

  const clearCanvas = () => {
    const removed = canvasImages;
    setCanvasImages([]);
    setFreestyleItems([]);
    if (onPhotoRemoved) {
      for (const src of removed) void onPhotoRemoved(src);
    }
  };

  const handleSaveDraft = () => {
    if (canvasImages.length === 0) {
      toast("Add images before saving a draft");
      return;
    }
    const saved = saveDraft(
      { clientName, sessionId: sessionId || null, images: canvasImages },
      currentDraftId || undefined
    );
    setCurrentDraftId(saved.id);
    onDraftSaved?.();
    toast.success("Draft saved");
  };

  const handleSend = (images: string[], note: string) => {
    // Delete draft after sending
    if (currentDraftId) deleteDraft(currentDraftId);
    toast.success("Mood board sent to " + clientName, {
      description: "Redirecting to dashboard…",
    });
    setTimeout(() => {
      onSend?.(images, note);
    }, 900);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
          <div>
            <h1 className="font-display text-base font-semibold">Create mood board</h1>
            <p className="font-body text-xs text-muted-foreground">
              for {clientName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setClientInfoOpen(true)}
            className="font-body text-xs h-8 rounded-sm gap-1.5"
          >
            <UserIcon className="h-3.5 w-3.5" />
            Client info
          </Button>
          {canvasImages.length > 0 && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearCanvas}
                className="font-body text-xs text-muted-foreground h-8 gap-1"
              >
                <Trash2Icon className="h-3.5 w-3.5" />
                Clear
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveDraft}
                className="font-body text-xs h-8 rounded-sm gap-1.5"
              >
                <SaveIcon className="h-3.5 w-3.5" />
                Save draft
              </Button>
            </>

          )}
          <Button
            onClick={() => setSendDialogOpen(true)}
            disabled={canvasImages.length === 0}
            size="sm"
            className="h-8 rounded-sm bg-foreground text-background hover:bg-foreground/90 font-body text-xs gap-1.5"
          >
            <SendIcon className="h-3.5 w-3.5" />
            Save & send
          </Button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Inspiration grid */}
        <div className="flex-1 flex flex-col border-r border-border min-w-0">
          {/* Filters */}
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
            <Select value={genderFilter} onValueChange={setGenderFilter}>
              <SelectTrigger className="w-[100px] h-8 rounded-sm font-body text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <span className="font-body text-sm text-muted-foreground">
              {resultCount} Results
            </span>
            <div className="ml-auto relative">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-[160px] h-8 pl-8 font-body text-xs rounded-sm"
              />
            </div>
          </div>

          {/* Photo grid */}
          <ScrollArea className="flex-1">
            <div className="columns-4 gap-2 p-5">
              {inspirations.map((photo, i) => {
                const isAdded = canvasImages.includes(photo.url);
                return (
                  <div
                    key={photo.id}
                    className="relative mb-2 group cursor-pointer break-inside-avoid"
                    onClick={() => addToCanvas(photo)}
                  >
                    <Image
                      src={photo.url}
                      alt={photo.title || `Inspiration ${i + 1}`}
                      width={400}
                      height={600}
                      unoptimized
                      className={cn(
                        "w-full rounded-sm object-cover transition-all duration-200",
                        isAdded && "ring-2 ring-accent opacity-70"
                      )}
                      loading="lazy"
                    />
                    {/* Hover overlay */}
                    <div
                      className={cn(
                        "absolute inset-0 rounded-sm flex items-center justify-center transition-opacity duration-200",
                        isAdded
                          ? "bg-accent/20 opacity-100"
                          : "bg-foreground/0 group-hover:bg-foreground/20 opacity-0 group-hover:opacity-100"
                      )}
                    >
                      {isAdded ? (
                        <span className="bg-accent text-accent-foreground rounded-full h-6 w-6 flex items-center justify-center text-xs font-body font-medium">
                          ✓
                        </span>
                      ) : (
                        <PlusIcon className="h-6 w-6 text-white drop-shadow-md" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Right: Canvas */}
        <div className="w-[400px] shrink-0 flex flex-col items-center justify-center p-6 bg-muted/30">
          <div className="w-full max-w-[360px]">
            <div className="flex items-center justify-between mb-3">
              <span className="font-display text-sm font-medium">Board</span>
              <span className="font-body text-[11px] text-muted-foreground">
                {canvasImages.length}/9 images
              </span>
            </div>

            {/* Mode toggle */}
            <div className="flex items-center gap-1 mb-3 p-0.5 bg-muted rounded-sm w-fit">
              <button
                onClick={() => setCanvasMode("template")}
                className={cn(
                  "px-2.5 py-1 rounded-sm font-body text-[11px] transition-colors",
                  canvasMode === "template"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Template
              </button>
              <button
                onClick={() => setCanvasMode("freestyle")}
                className={cn(
                  "px-2.5 py-1 rounded-sm font-body text-[11px] transition-colors",
                  canvasMode === "freestyle"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Freestyle
              </button>
            </div>

            {/* Canvas area */}
            <div className="aspect-square w-full rounded-sm border-2 border-dashed border-border bg-background overflow-hidden">
              {canvasImages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-6">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <PlusIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="font-body text-sm text-muted-foreground">
                    Click images to add
                  </p>
                  <p className="font-body text-xs text-muted-foreground/60 mt-1">
                    {canvasMode === "template"
                      ? "Photos will snap into a curated layout"
                      : "Drag photos freely on the canvas"}
                  </p>
                </div>
              ) : canvasMode === "template" ? (
                <MoodBoardGrid
                  images={canvasImages}
                  editable
                  onRemove={removeFromCanvas}
                  className="h-full"
                />
              ) : (
                <MoodBoardFreestyle
                  items={freestyleItems}
                  onChange={setFreestyleItems}
                  onRemove={(i) => {
                    const src = freestyleItems[i]?.src;
                    if (!src) return;
                    const idx = canvasImages.indexOf(src);
                    if (idx >= 0) removeFromCanvas(idx);
                  }}
                  className="h-full"
                />
              )}
            </div>
            {canvasMode === "freestyle" && canvasImages.length > 0 && (
              <p className="font-body text-[10px] text-muted-foreground/70 mt-2 text-center">
                Drag to position · drag bottom-right corner to resize
              </p>
            )}
          </div>
        </div>
      </div>

      <SendMoodBoardDialog
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        images={canvasImages}
        clientName={clientName}
        onSend={handleSend}
      />

      <ClientDetailPanel
        open={clientInfoOpen}
        onOpenChange={setClientInfoOpen}
        sessionId={sessionId || null}
      />
    </div>
  );
}
