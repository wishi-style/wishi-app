"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckIcon, SearchIcon } from "lucide-react";
import { lookLibrary, type LookLibraryItem } from "@/data/lookLibrary";

interface LookLibraryPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (look: LookLibraryItem) => void;
  /** Optional style label, used to pre-filter and as title context */
  contextLabel?: string;
  /** Initial query/filter (e.g. style name) */
  initialQuery?: string;
}

export function LookLibraryPicker({
  open,
  onOpenChange,
  onSelect,
  contextLabel,
  initialQuery = "",
}: LookLibraryPickerProps) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lookLibrary;
    return lookLibrary.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [query]);

  const handleConfirm = () => {
    const look = lookLibrary.find((l) => l.id === selectedId);
    if (!look) return;
    onSelect(look);
    setSelectedId(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            Choose a look{contextLabel ? ` for ${contextLabel}` : ""}
          </DialogTitle>
          <DialogDescription className="font-body">
            Pick one from your library to feature on this style board.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <SearchIcon className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or tag (e.g. Minimal, Glam)"
            className="pl-9"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
          {filtered.length === 0 ? (
            <p className="font-body text-sm text-muted-foreground py-12 text-center">
              No looks match your search.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 py-2">
              {filtered.map((look) => {
                const selected = selectedId === look.id;
                return (
                  <button
                    type="button"
                    key={look.id}
                    onClick={() => setSelectedId(look.id)}
                    className={`group text-left space-y-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                  >
                    <div
                      className={`aspect-square overflow-hidden rounded-md border bg-muted relative ${
                        selected ? "border-foreground ring-2 ring-foreground" : "border-border"
                      }`}
                    >
                      <Image
                        src={look.imageUrl}
                        alt={look.name}
                        width={400}
                        height={400}
                        unoptimized
                        className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                      />
                      {selected && (
                        <span className="absolute top-2 right-2 h-6 w-6 rounded-full bg-foreground text-background flex items-center justify-center">
                          <CheckIcon className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                    <div className="px-0.5">
                      <p className="font-body text-sm truncate">{look.name}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {look.tags.slice(0, 2).map((t) => (
                          <Badge
                            key={t}
                            variant="secondary"
                            className="font-body text-[10px] px-1.5 py-0"
                          >
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedId}>
            Feature this look
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
