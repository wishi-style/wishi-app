"use client";

// Loveable-styled moodboard creator: Pinterest-style inspiration library on
// the left + asymmetric canvas preview on the right + save-and-send dialog
// with an AI-drafted note. Wires to the existing moodboard service + photos
// API (no localStorage drafts — draft state is the DB row with sentAt null).

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeftIcon,
  SearchIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
  UserIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MoodBoardGrid } from "@/components/stylist/moodboard-grid";
import { SendMoodBoardDialog } from "@/components/stylist/send-moodboard-dialog";
import { toast } from "sonner";
import type {
  BoardPhoto,
  InspirationPhoto,
} from "@/generated/prisma/client";

interface Props {
  boardId: string;
  sessionId: string;
  clientName: string;
  initialPhotos: BoardPhoto[];
  inspiration: InspirationPhoto[];
}

export function MoodboardBuilder({
  boardId,
  sessionId,
  clientName,
  initialPhotos,
  inspiration,
}: Props) {
  const router = useRouter();
  const [photos, setPhotos] = useState(initialPhotos);
  const [sendOpen, setSendOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [genderFilter, setGenderFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);

  const addedInspirationIds = new Set(
    photos
      .map((p) => p.inspirationPhotoId)
      .filter((id): id is string => id != null),
  );

  const filtered = inspiration.filter((p) => {
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const haystack = `${p.title ?? ""} ${p.tags.join(" ")}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (genderFilter !== "all") {
      const cat = p.category?.toLowerCase() ?? "";
      if (!cat.includes(genderFilter)) return false;
    }
    return true;
  });

  async function addFromInspiration(photo: InspirationPhoto) {
    if (addedInspirationIds.has(photo.id)) {
      toast("Already on board");
      return;
    }
    if (photos.length >= 9) {
      toast("Maximum 9 images per mood board");
      return;
    }
    const res = await fetch(`/api/moodboards/${boardId}/photos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        s3Key: photo.s3Key,
        url: photo.url,
        inspirationPhotoId: photo.id,
      }),
    });
    if (!res.ok) {
      setError("Could not add photo");
      return;
    }
    const created = (await res.json()) as BoardPhoto;
    setPhotos((p) => [...p, created]);
  }

  async function removePhoto(photoId: string) {
    const prev = photos;
    setPhotos((p) => p.filter((ph) => ph.id !== photoId));
    const res = await fetch(
      `/api/moodboards/${boardId}/photos/${photoId}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      setPhotos(prev);
      setError("Could not remove photo");
    }
  }

  function clearCanvas() {
    const ids = photos.map((p) => p.id);
    setPhotos([]);
    ids.forEach((id) => {
      void fetch(`/api/moodboards/${boardId}/photos/${id}`, {
        method: "DELETE",
      });
    });
  }

  async function sendBoard(note: string) {
    setError(null);
    const res = await fetch(`/api/moodboards/${boardId}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Send failed");
      toast.error(body.error ?? "Send failed");
      return;
    }
    toast.success(`Mood board sent to ${clientName}`);
    router.push(`/stylist/sessions/${sessionId}/workspace`);
    router.refresh();
  }

  const canvasImages = photos.map((p) => ({ id: p.id, url: p.url }));

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href={`/stylist/sessions/${sessionId}/workspace`}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="font-display text-base font-semibold">
              Create mood board
            </h1>
            <p className="font-body text-xs text-muted-foreground">
              for {clientName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/stylist/clients/${sessionId}`}
            className="inline-flex items-center gap-1.5 h-8 rounded-sm border border-border px-3 font-body text-xs hover:bg-muted transition-colors"
          >
            <UserIcon className="h-3.5 w-3.5" />
            Client info
          </Link>
          {photos.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearCanvas}
              className="font-body text-xs text-muted-foreground h-8 gap-1"
            >
              <Trash2Icon className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
          <Button
            onClick={() => setSendOpen(true)}
            disabled={photos.length === 0}
            size="sm"
            className="h-8 rounded-sm bg-foreground text-background hover:bg-foreground/90 font-body text-xs gap-1.5"
          >
            <SendIcon className="h-3.5 w-3.5" />
            Save & send
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 px-5 py-2 text-xs text-red-700">{error}</div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Inspiration library */}
        <div className="flex-1 flex flex-col border-r border-border min-w-0">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
            <Select
              value={genderFilter}
              onValueChange={(v) => setGenderFilter(v ?? "all")}
            >
              <SelectTrigger className="w-[100px] h-8 rounded-sm font-body text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="male">Male</SelectItem>
              </SelectContent>
            </Select>
            <span className="font-body text-sm text-muted-foreground">
              {filtered.length} results
            </span>
            <div className="ml-auto relative">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-[180px] h-8 pl-8 font-body text-xs rounded-sm"
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="columns-3 md:columns-4 gap-2 p-5">
              {filtered.map((p) => {
                const isAdded = addedInspirationIds.has(p.id);
                return (
                  <div
                    key={p.id}
                    className="relative mb-2 group cursor-pointer break-inside-avoid"
                    onClick={() => void addFromInspiration(p)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.title ?? ""}
                      className={cn(
                        "w-full rounded-sm object-cover transition-all duration-200",
                        isAdded && "ring-2 ring-accent opacity-70",
                      )}
                      loading="lazy"
                    />
                    <div
                      className={cn(
                        "absolute inset-0 rounded-sm flex items-center justify-center transition-opacity duration-200",
                        isAdded
                          ? "bg-accent/20 opacity-100"
                          : "bg-foreground/0 group-hover:bg-foreground/20 opacity-0 group-hover:opacity-100",
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
              {filtered.length === 0 && (
                <p className="font-body text-sm text-muted-foreground col-span-full">
                  No inspiration photos match your filters.
                </p>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Canvas preview */}
        <div className="w-[400px] shrink-0 hidden md:flex flex-col items-center justify-center p-6 bg-muted/30">
          <div className="w-full max-w-[360px]">
            <div className="flex items-center justify-between mb-3">
              <span className="font-display text-sm font-medium">Board</span>
              <span className="font-body text-[11px] text-muted-foreground">
                {photos.length}/9 images
              </span>
            </div>
            <div className="aspect-square w-full rounded-sm border-2 border-dashed border-border bg-background overflow-hidden">
              {photos.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-6">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <PlusIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="font-body text-sm text-muted-foreground">
                    Click images to add
                  </p>
                  <p className="font-body text-xs text-muted-foreground/60 mt-1">
                    Select up to 9 inspiration photos
                  </p>
                </div>
              ) : (
                <MoodBoardGrid
                  images={canvasImages}
                  editable
                  onRemove={(id) => void removePhoto(id)}
                  className="h-full"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <SendMoodBoardDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        images={canvasImages}
        clientName={clientName}
        onSend={sendBoard}
      />
    </div>
  );
}
