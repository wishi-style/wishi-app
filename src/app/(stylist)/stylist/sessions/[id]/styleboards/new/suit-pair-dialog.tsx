"use client";

import { useState } from "react";
import Image from "next/image";
import { Loader2Icon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { SuitPairRow } from "@/lib/inventory/types";

interface SuitPairDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  /** Called when the stylist taps a pair — adds both items to the canvas. */
  onAddPair: (pair: SuitPairRow) => void;
}

/** Service vocabulary; matches color_family values in `product_variants`. */
const COLOR_FAMILIES = [
  { key: "black", label: "Black", hex: "#111" },
  { key: "navy", label: "Navy", hex: "#1f2a44" },
  { key: "grey", label: "Grey", hex: "#9ca3af" },
  { key: "brown", label: "Brown", hex: "#7a4e2d" },
  { key: "beige", label: "Beige", hex: "#d9c3a1" },
  { key: "blue", label: "Blue", hex: "#3b82f6" },
  { key: "green", label: "Green", hex: "#4b7f52" },
  { key: "burgundy", label: "Burgundy", hex: "#7b1f2c" },
];

export function SuitPairDialog({
  open,
  onOpenChange,
  sessionId,
  onAddPair,
}: SuitPairDialogProps) {
  const [colorFamily, setColorFamily] = useState<string | null>(null);
  const [vibe, setVibe] = useState("");
  const [loading, setLoading] = useState(false);
  const [pairs, setPairs] = useState<SuitPairRow[]>([]);

  const runSearch = async () => {
    if (!colorFamily) {
      toast("Pick a color family first");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/stylist/sessions/${encodeURIComponent(sessionId)}/shop-inventory/suit-pairs`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            colorFamily,
            semanticQuery: vibe.trim() || undefined,
            limit: 18,
          }),
        },
      );
      if (!res.ok) throw new Error(`Suit-pair search failed (${res.status})`);
      const json = (await res.json()) as { pairs: SuitPairRow[] };
      setPairs(json.pairs);
      if (json.pairs.length === 0) {
        toast("No suit pairs found for that color");
      }
    } catch (err) {
      console.warn("[suit-pair] search failed:", err);
      toast.error("Couldn't run suit-pair search");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setColorFamily(null);
          setVibe("");
          setPairs([]);
        }
      }}
    >
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Find a suit pair</DialogTitle>
          <DialogDescription>
            Pre-computed blazer + pants combos from the catalog, anchored by color
            family. Add an optional vibe to refine the blazer choice.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="font-display text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Color family
            </p>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_FAMILIES.map((c) => {
                const active = colorFamily === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setColorFamily(c.key)}
                    className={cn(
                      "h-8 inline-flex items-center gap-2 px-2.5 rounded-sm border font-body text-[11px] transition-colors",
                      active
                        ? "bg-foreground text-background border-foreground"
                        : "bg-background text-foreground border-border hover:bg-muted",
                    )}
                  >
                    <span
                      className="h-3 w-3 rounded-full border border-border"
                      style={{ backgroundColor: c.hex }}
                    />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="font-display text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Vibe (optional)
            </p>
            <Input
              placeholder="e.g. minimal · double-breasted · slim · breezy"
              value={vibe}
              onChange={(e) => setVibe(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void runSearch();
                }
              }}
              className="h-8 font-body text-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void runSearch()}
              disabled={loading || !colorFamily}
            >
              {loading ? (
                <>
                  <Loader2Icon className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Searching…
                </>
              ) : (
                "Find pairs"
              )}
            </Button>
          </div>

          {pairs.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
              {pairs.map((p) => (
                <button
                  key={`${p.blazer_product_id}-${p.pants_product_id}`}
                  type="button"
                  onClick={() => {
                    onAddPair(p);
                    onOpenChange(false);
                  }}
                  className="group bg-card border border-border rounded-sm overflow-hidden hover:border-foreground transition-colors text-left"
                >
                  <div className="grid grid-cols-2 gap-0.5 bg-muted">
                    <div className="aspect-square overflow-hidden">
                      {p.blazer_image_url ? (
                        <Image
                          src={p.blazer_image_url}
                          alt={p.blazer_name}
                          width={300}
                          height={300}
                          unoptimized
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : null}
                    </div>
                    <div className="aspect-square overflow-hidden">
                      {p.pants_image_url ? (
                        <Image
                          src={p.pants_image_url}
                          alt={p.pants_name}
                          width={300}
                          height={300}
                          unoptimized
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : null}
                    </div>
                  </div>
                  <div className="p-2 space-y-0.5">
                    <p className="font-body text-[11px] font-medium truncate">{p.brand_name}</p>
                    <p className="font-body text-[10px] text-muted-foreground truncate">
                      {p.color_raw}
                    </p>
                    <p className="font-body text-[10px] text-foreground">
                      ${Math.round(p.blazer_min_price + p.pants_min_price)} total
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
