"use client";

import { Share2Icon, Trash2Icon, DownloadIcon, PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ClosetItem } from "@/generated/prisma/client";

interface Props {
  item: ClosetItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (id: string) => Promise<void> | void;
}

function formatDateAdded(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Loveable's ClosetItemDialog — opens when a tile is tapped outside select
 * mode. Two-column dialog: contained image on the left, brand / name /
 * detail chips / actions on the right.
 *
 * Differences vs Loveable source:
 *   - "Outfits this is in" carousel is omitted (would require an extra
 *     boardItems→board lookup per open). Tracked under WISHI-REBUILD-PLAN
 *     Phase 11 polish.
 *   - Edit button keeps Loveable's "coming soon" toast since the inline
 *     edit form isn't ported yet.
 */
export function ClosetItemDialog({ item, open, onOpenChange, onDelete }: Props) {
  if (!item) return null;

  function handleShare() {
    if (typeof window === "undefined") return;
    void navigator.clipboard?.writeText(window.location.href);
    toast.success("Link copied to clipboard");
  }

  function handleDownload() {
    if (typeof window === "undefined" || !item) return;
    const link = document.createElement("a");
    link.href = item.url;
    link.download = `${item.designer ?? "closet"}-${item.name ?? item.id}.jpg`;
    link.click();
    toast.success("Image downloaded");
  }

  async function handleDelete() {
    if (!item) return;
    await onDelete(item.id);
    onOpenChange(false);
  }

  const color = item.colors[0] ?? null;
  const details: { label: string; value: string }[] = [
    ...(color ? [{ label: "Color", value: color }] : []),
    ...(item.size ? [{ label: "Size", value: item.size }] : []),
    ...(item.material ? [{ label: "Material", value: item.material }] : []),
    ...(item.season ? [{ label: "Season", value: item.season }] : []),
  ];

  const actions: {
    icon: typeof Share2Icon;
    label: string;
    onClick: () => void;
    destructive?: boolean;
  }[] = [
    { icon: Share2Icon, label: "Share", onClick: handleShare },
    { icon: DownloadIcon, label: "Download", onClick: handleDownload },
    {
      icon: PencilIcon,
      label: "Edit",
      onClick: () => toast("Edit coming soon"),
    },
    {
      icon: Trash2Icon,
      label: "Delete",
      onClick: () => void handleDelete(),
      destructive: true,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl p-0 overflow-hidden">
        <div className="grid md:grid-cols-[1fr_1.2fr]">
          <div className="flex min-h-[300px] items-center justify-center bg-background p-8 md:min-h-[500px] md:p-12">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.url}
              alt={item.name ?? item.designer ?? "Closet item"}
              className="h-full max-h-[480px] w-full object-contain"
            />
          </div>

          <div className="flex max-h-[80vh] flex-col overflow-y-auto bg-muted/30 p-8 md:p-10">
            {item.category && (
              <span className="mb-2 font-body text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                {item.category}
              </span>
            )}

            <h2 className="mb-1 font-display text-2xl leading-tight md:text-3xl">
              {item.name ?? item.designer ?? "Item"}
            </h2>
            {item.designer && (
              <p className="mb-8 font-body text-base text-muted-foreground">
                {item.designer}
              </p>
            )}

            {details.length > 0 && (
              <div className="mb-8 flex flex-wrap gap-2">
                {details.map((d) => (
                  <div
                    key={d.label}
                    className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2"
                  >
                    <span className="font-body text-[10px] uppercase tracking-wider text-muted-foreground">
                      {d.label}
                    </span>
                    <span className="font-body text-sm capitalize text-foreground">
                      {d.value}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p className="mb-8 font-body text-xs text-muted-foreground">
              Added {formatDateAdded(item.createdAt)}
            </p>

            <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-4">
              {actions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    type="button"
                    onClick={action.onClick}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-4 py-2.5 font-body text-sm transition-colors",
                      action.destructive
                        ? "text-destructive hover:bg-destructive/10"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {action.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
