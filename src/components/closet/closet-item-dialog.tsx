"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  DownloadIcon,
  Share2Icon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export type ClosetItemPayload = {
  id: string;
  url: string;
  name?: string | null;
  designer?: string | null;
  season?: string | null;
  category?: string | null;
  colors?: string[];
  size?: string | null;
  material?: string | null;
  sourceOrderItemId?: string | null;
  createdAt?: string | Date | null;
};

export type OutfitReference = {
  /** Board.id of a styleboard that used this closet item */
  boardId: string;
  title?: string | null;
  heroImageUrl?: string | null;
  /** ISO timestamp — when the look was sent */
  sentAt?: string | null;
};

export interface ClosetItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ClosetItemPayload | null;
  /** Styleboards that reference this closet item. Caller hydrates. */
  outfits?: OutfitReference[];
  onDeleted?: (id: string) => void;
}

/**
 * Closet item viewer with outfit cross-reference ("worn in these looks"),
 * Share / Download / Delete actions. Delete soft-deletes via the existing
 * DELETE /api/closet/[id] route.
 */
export function ClosetItemDialog({
  open,
  onOpenChange,
  item,
  outfits,
  onDeleted,
}: ClosetItemDialogProps) {
  const [deleting, setDeleting] = React.useState(false);

  const share = async () => {
    if (!item) return;
    const url = typeof window !== "undefined" ? window.location.href : item.url;
    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function"
      ) {
        await navigator.share({
          title: item.name ?? "My closet item",
          url,
        });
      } else if (
        typeof navigator !== "undefined" &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      } else {
        toast.info("Sharing isn't supported on this browser");
      }
    } catch {
      // User cancelled share sheet — no toast.
    }
  };

  const download = () => {
    if (!item) return;
    const a = document.createElement("a");
    a.href = item.url;
    a.download = item.name ?? "closet-item";
    a.target = "_blank";
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const remove = async () => {
    if (!item) return;
    if (!window.confirm("Delete this item from your closet?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/closet/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Couldn't delete item");
      onDeleted?.(item.id);
      onOpenChange(false);
      toast.success("Removed from your closet");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="text-xs uppercase tracking-widest text-dark-taupe">
            Closet item
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {item ? (
          <div className="max-h-[75vh] overflow-y-auto">
            <div className="grid md:grid-cols-2 gap-0">
              <div className="bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.url}
                  alt={item.name ?? "Closet item"}
                  className="w-full aspect-square object-cover"
                />
              </div>
              <div className="p-6 space-y-4">
                {item.designer ? (
                  <p className="text-xs uppercase tracking-widest text-dark-taupe">
                    {item.designer}
                  </p>
                ) : null}
                <h2 className="font-display text-2xl">
                  {item.name ?? "Untitled item"}
                </h2>
                <dl className="text-sm space-y-1.5">
                  {item.category ? (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Category</dt>
                      <dd>{item.category}</dd>
                    </div>
                  ) : null}
                  {item.season ? (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Season</dt>
                      <dd>{item.season}</dd>
                    </div>
                  ) : null}
                  {item.size ? (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Size</dt>
                      <dd>{item.size}</dd>
                    </div>
                  ) : null}
                  {item.material ? (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Material</dt>
                      <dd>{item.material}</dd>
                    </div>
                  ) : null}
                  {item.colors && item.colors.length > 0 ? (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Colors</dt>
                      <dd>{item.colors.join(", ")}</dd>
                    </div>
                  ) : null}
                </dl>

                {item.sourceOrderItemId ? (
                  <p className="text-xs text-muted-foreground">
                    Added from a purchase through Wishi.
                  </p>
                ) : null}

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={share}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-xs hover:bg-muted transition-colors"
                  >
                    <Share2Icon className="h-4 w-4" />
                    Share
                  </button>
                  <button
                    type="button"
                    onClick={download}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-xs hover:bg-muted transition-colors"
                  >
                    <DownloadIcon className="h-4 w-4" />
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={remove}
                    disabled={deleting}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-destructive/30 text-destructive px-4 text-xs hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                  >
                    <Trash2Icon className="h-4 w-4" />
                    {deleting ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            </div>

            {outfits && outfits.length > 0 ? (
              <div className="px-6 py-5 border-t border-border">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
                  Worn in these looks
                </p>
                <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                  {outfits.map((o) => (
                    <a
                      key={o.boardId}
                      href={`/sessions/*/styleboards/${o.boardId}`}
                      className="block"
                    >
                      {o.heroImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={o.heroImageUrl}
                          alt={o.title ?? ""}
                          className="w-full aspect-[3/4] object-cover rounded-md bg-muted"
                        />
                      ) : (
                        <div className="w-full aspect-[3/4] rounded-md bg-muted" />
                      )}
                      {o.title ? (
                        <p className="mt-1.5 text-xs truncate">{o.title}</p>
                      ) : null}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="p-8 text-sm text-muted-foreground text-center">
            Loading…
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
