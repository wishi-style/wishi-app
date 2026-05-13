"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Camera,
  Image as ImageIcon,
  Globe,
  Trash2,
  ChevronRight,
  Grid3X3Icon,
  LayoutGridIcon,
} from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ClosetItem } from "@/generated/prisma/client";
import {
  computeClosetFacets,
  filterClosetItems,
  type ClosetFilterKey as FilterKey,
  type ClosetFilters,
} from "@/lib/closet/filter";
import { ClosetItemDialog } from "./closet-item-dialog";

export interface Look {
  boardId: string;
  sessionId: string | null;
  title: string | null;
  thumbnailUrl: string | null;
  stylistName: string;
  sentAt: string;
}

export interface ShopItem {
  inventoryProductId: string;
  sourceBoardId: string;
  title: string | null;
  designer: string | null;
  priceDollars: number | null;
  imageUrl: string | null;
  productUrl: string | null;
  category: string | null;
  colors: string[];
}

interface OutfitPreview {
  id: string;
  title: string;
  image: string | null;
}

interface Props {
  initialItems: ClosetItem[];
  shopItems: ShopItem[];
  looks: Look[];
  outfitsByItemId: Record<string, OutfitPreview[]>;
}

// Loveable Profile.tsx renders the Category filter as a top horizontal
// strip (10 hardcoded categories with underline active state) and keeps
// Designer / Season / Color in the left sidebar. Mirror that split.
const SIDEBAR_FILTER_KEYS: Exclude<FilterKey, "category">[] = [
  "designer",
  "season",
  "color",
];

const SIDEBAR_FILTER_LABELS: Record<
  Exclude<FilterKey, "category">,
  string
> = {
  designer: "Designer",
  season: "Season",
  color: "Color",
};

// Loveable's hardcoded category list — Profile.tsx:52.
const LOVEABLE_CATEGORIES = [
  "All",
  "Tops",
  "Bottoms",
  "Dresses",
  "Outerwear",
  "Shoes",
  "Bags",
  "Accessories",
  "Active & Lounge",
  "Swim & Beauty",
] as const;

// Loveable's mobile chip rows show Season + Color (Items tab).
const MOBILE_CHIP_KEYS = ["season", "color"] as const satisfies readonly Exclude<
  FilterKey,
  "category" | "designer"
>[];

export function ProfilePageClient({
  initialItems,
  shopItems,
  looks,
  outfitsByItemId,
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [filters, setFilters] = useState<ClosetFilters>({});
  const [openFilter, setOpenFilter] = useState<FilterKey | null>("category");
  const [addOpen, setAddOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gridSize, setGridSize] = useState<"normal" | "compact">("normal");
  const [detailItem, setDetailItem] = useState<ClosetItem | null>(null);
  const [looksStylistFilter, setLooksStylistFilter] = useState<Set<string>>(
    new Set(),
  );

  // Items tab is a union of (a) user closet items (uploaded or order-arrived)
  // and (b) inventory products from delivered styleboards. Each row carries
  // its `source` so the chip + click behavior differentiate.
  type GridRow =
    | { source: "closet"; key: string; closet: ClosetItem }
    | { source: "shop"; key: string; shop: ShopItem };

  const gridRows: GridRow[] = useMemo(() => {
    const closetRows: GridRow[] = items.map((c) => ({
      source: "closet" as const,
      key: `closet:${c.id}`,
      closet: c,
    }));
    const shopRows: GridRow[] = shopItems.map((s) => ({
      source: "shop" as const,
      key: `shop:${s.inventoryProductId}`,
      shop: s,
    }));
    return [...closetRows, ...shopRows];
  }, [items, shopItems]);

  const facets = useMemo(() => {
    const closetFacets = computeClosetFacets(items);
    const designers = new Set(closetFacets.designer ?? []);
    const colors = new Set(closetFacets.color ?? []);
    const categories = new Set(closetFacets.category ?? []);
    for (const s of shopItems) {
      if (s.designer) designers.add(s.designer);
      for (const c of s.colors) colors.add(c);
      if (s.category) categories.add(s.category);
    }
    return {
      ...closetFacets,
      designer: Array.from(designers).sort(),
      color: Array.from(colors).sort(),
      category: Array.from(categories).sort(),
    };
  }, [items, shopItems]);

  const filteredRows = useMemo(() => {
    return gridRows.filter((row) => {
      if (row.source === "closet") {
        return filterClosetItems([row.closet], filters).length === 1;
      }
      const shop = row.shop;
      const cats = filters.category ?? [];
      if (cats.length > 0 && (!shop.category || !cats.includes(shop.category))) {
        return false;
      }
      const designers = filters.designer ?? [];
      if (
        designers.length > 0 &&
        (!shop.designer || !designers.includes(shop.designer))
      ) {
        return false;
      }
      const colorsFilter = filters.color ?? [];
      if (
        colorsFilter.length > 0 &&
        !shop.colors.some((c) => colorsFilter.includes(c))
      ) {
        return false;
      }
      // Season is closet-only; shop rows pass through.
      return true;
    });
  }, [gridRows, filters]);

  const looksStylists = useMemo(
    () => Array.from(new Set(looks.map((l) => l.stylistName))).sort(),
    [looks],
  );
  const filteredLooks = useMemo(
    () =>
      looksStylistFilter.size === 0
        ? looks
        : looks.filter((l) => looksStylistFilter.has(l.stylistName)),
    [looks, looksStylistFilter],
  );

  function toggleLooksStylist(name: string) {
    setLooksStylistFilter((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const activeFilterCount = useMemo(
    () =>
      (Object.values(filters) as (string[] | undefined)[]).reduce(
        (sum, arr) => sum + (arr?.length ?? 0),
        0,
      ),
    [filters],
  );

  function toggleFilter(key: FilterKey, value: string) {
    setFilters((prev) => {
      const current = prev[key] ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [key]: next };
    });
  }

  function clearAllFilters() {
    setFilters({});
  }

  function toggleItemSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function deleteSingleItem(id: string) {
    const res = await fetch(`/api/closet/${id}`, { method: "DELETE" });
    if (res.ok) setItems((p) => p.filter((i) => i.id !== id));
  }

  async function deleteSelectedItems() {
    if (selected.size === 0) return;
    const count = selected.size;
    if (
      !confirm(
        `Remove ${count} item${count > 1 ? "s" : ""} from your closet?`,
      )
    )
      return;
    const ids = Array.from(selected);
    const results = await Promise.all(
      ids.map((id) => fetch(`/api/closet/${id}`, { method: "DELETE" })),
    );
    const okIds = ids.filter((_, i) => results[i]?.ok);
    if (okIds.length > 0) {
      const okSet = new Set(okIds);
      setItems((p) => p.filter((i) => !okSet.has(i.id)));
    }
    setSelected(new Set());
    setSelectMode(false);
  }

  function handleItemAdded(item: ClosetItem) {
    setItems((p) => [item, ...p]);
    setAddOpen(false);
  }

  return (
    <>
      <Tabs defaultValue="items" className="w-full">
        <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b border-border bg-transparent p-0">
          <TabsTrigger
            value="items"
            className="rounded-none border-b-2 border-transparent px-0 pb-3 text-base data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Items
          </TabsTrigger>
          <TabsTrigger
            value="looks"
            className="rounded-none border-b-2 border-transparent px-0 pb-3 text-base data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Looks
          </TabsTrigger>
        </TabsList>

        {/* Items tab — sidebar filters + grid + add dialog */}
        <TabsContent value="items" className="mt-6">
          {/* Mobile-only chip filters — Loveable Profile.tsx:316-366. Season +
              Color rows are stacked above the category strip on small screens.
              Hidden at lg+ since the desktop sidebar covers these facets. */}
          <div className="mb-4 flex flex-col gap-3 lg:hidden">
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="self-end font-body text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Clear all
              </button>
            )}
            {MOBILE_CHIP_KEYS.map((key) => {
              const values = facets[key] ?? [];
              if (values.length === 0) return null;
              const selectedValues = filters[key] ?? [];
              return (
                <div key={key} className="flex flex-wrap gap-2">
                  <span className="mr-1 self-center font-body text-xs uppercase tracking-widest text-muted-foreground">
                    {SIDEBAR_FILTER_LABELS[key]}
                  </span>
                  {values.map((v) => {
                    const active = selectedValues.includes(v);
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => toggleFilter(key, v)}
                        className={cn(
                          "rounded-full border px-3 py-1 font-body text-xs capitalize transition-colors",
                          active
                            ? "border-foreground bg-foreground text-background"
                            : "border-border text-foreground hover:bg-muted",
                        )}
                      >
                        {v}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Loveable's top horizontal category strip — Profile.tsx:368-396.
              "All" clears any category selection; clicking a category toggles
              it in/out of `filters.category`. The Designer/Season/Color
              sidebar continues to layer on top of this. */}
          <div className="mb-5 flex items-center gap-4 overflow-x-auto pb-2">
            {LOVEABLE_CATEGORIES.map((cat) => {
              const selectedCats = filters.category ?? [];
              const isAll = cat === "All";
              const isActive = isAll
                ? selectedCats.length === 0
                : selectedCats.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    if (isAll) {
                      setFilters((prev) => ({ ...prev, category: [] }));
                      return;
                    }
                    setFilters((prev) => {
                      const current = prev.category ?? [];
                      const next = current.includes(cat)
                        ? current.filter((v) => v !== cat)
                        : [...current, cat];
                      return { ...prev, category: next };
                    });
                  }}
                  className={cn(
                    "shrink-0 whitespace-nowrap font-body text-sm transition-colors",
                    isActive
                      ? "font-medium text-foreground underline underline-offset-4"
                      : "text-foreground/70 hover:text-foreground",
                  )}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          <div className="flex gap-8">
            {/* Filter sidebar */}
            <aside className="hidden w-52 shrink-0 lg:block">
              <div className="mb-4 flex items-baseline justify-between">
                <h3 className="font-display text-lg">Filter</h3>
                {activeFilterCount > 0 ? (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="font-body text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Clear all
                  </button>
                ) : null}
              </div>
              {SIDEBAR_FILTER_KEYS.map((key) => {
                const values = facets[key];
                const selectedFacet = filters[key] ?? [];
                const isOpen = openFilter === key;
                return (
                  <div key={key} className="border-b border-border">
                    <button
                      type="button"
                      onClick={() => setOpenFilter(isOpen ? null : key)}
                      className="flex w-full items-center justify-between py-3 text-left text-sm text-foreground hover:text-muted-foreground"
                    >
                      <span>
                        {SIDEBAR_FILTER_LABELS[key]}
                        {selectedFacet.length > 0 && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            · {selectedFacet.length}
                          </span>
                        )}
                      </span>
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 text-muted-foreground transition-transform",
                          isOpen && "rotate-90",
                        )}
                      />
                    </button>
                    {isOpen && (
                      <div className="pb-3">
                        {values.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            None yet
                          </p>
                        ) : (
                          <ul className="space-y-1">
                            {values.map((v) => {
                              const active = selectedFacet.includes(v);
                              return (
                                <li key={v}>
                                  <button
                                    type="button"
                                    onClick={() => toggleFilter(key, v)}
                                    className={cn(
                                      "block w-full rounded px-2 py-1 text-left text-xs capitalize hover:bg-muted",
                                      active &&
                                        "bg-muted font-medium text-foreground",
                                    )}
                                  >
                                    {v}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </aside>

            <div className="min-w-0 flex-1">
              {/* Toolbar: grid toggle (left), count + select (right) —
                  Loveable Profile.tsx:573-609 */}
              <div className="mb-5 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() =>
                    setGridSize(gridSize === "normal" ? "compact" : "normal")
                  }
                  aria-label={
                    gridSize === "normal"
                      ? "Switch to compact grid"
                      : "Switch to normal grid"
                  }
                  className="rounded-lg border border-border p-2 transition-colors hover:bg-muted"
                >
                  {gridSize === "normal" ? (
                    <Grid3X3Icon className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <LayoutGridIcon className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                <div className="flex items-center gap-4">
                  <span className="font-body text-sm uppercase tracking-wider text-muted-foreground">
                    {filteredRows.length}{" "}
                    {filteredRows.length === 1 ? "Item" : "Items"}
                  </span>
                  {selectMode ? (
                    <div className="flex items-center gap-3">
                      {selected.size > 0 && (
                        <button
                          type="button"
                          onClick={() => void deleteSelectedItems()}
                          className="font-body text-sm text-destructive hover:underline"
                        >
                          <Trash2 className="mr-1 inline h-4 w-4" />
                          Delete ({selected.size})
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectMode(false);
                          setSelected(new Set());
                        }}
                        className="font-body text-sm text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSelectMode(true)}
                      className="font-body text-sm text-muted-foreground hover:text-foreground"
                    >
                      Select
                    </button>
                  )}
                </div>
              </div>

              {/* Active filter chips */}
              {activeFilterCount > 0 && (
                <div className="mb-5 flex flex-wrap items-center gap-2">
                  {(
                    ["designer", "season", "color", "category"] as FilterKey[]
                  ).flatMap((key) =>
                    (filters[key] ?? []).map((value) => (
                      <button
                        key={`${key}:${value}`}
                        type="button"
                        onClick={() => toggleFilter(key, value)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs capitalize text-foreground hover:bg-muted"
                      >
                        {value}
                        <span aria-hidden className="text-muted-foreground">
                          ×
                        </span>
                      </button>
                    )),
                  )}
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="font-body text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Clear all
                  </button>
                </div>
              )}

              {filteredRows.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  {gridRows.length === 0
                    ? "No items yet. Items styled for you and uploads will appear here."
                    : "No items match the current filters."}
                </p>
              ) : (
                <div
                  className={cn(
                    "grid gap-3",
                    gridSize === "normal"
                      ? "grid-cols-3 md:grid-cols-4"
                      : "grid-cols-4 md:grid-cols-5",
                  )}
                >
                  {filteredRows.map((row) => {
                    if (row.source === "closet") {
                      const item = row.closet;
                      const isSelected = selected.has(item.id);
                      return (
                        <button
                          key={row.key}
                          type="button"
                          onClick={() => {
                            if (selectMode) toggleItemSelect(item.id);
                            else setDetailItem(item);
                          }}
                          className={cn(
                            "relative overflow-hidden rounded-xl border bg-card text-left transition-all",
                            isSelected
                              ? "border-foreground ring-2 ring-foreground"
                              : "border-border",
                            selectMode && "cursor-pointer",
                          )}
                        >
                          {selectMode && (
                            <div
                              className={cn(
                                "absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full border-2",
                                isSelected
                                  ? "border-foreground bg-foreground"
                                  : "border-muted-foreground/40 bg-background/80",
                              )}
                            >
                              {isSelected && (
                                <div className="h-2 w-2 rounded-full bg-background" />
                              )}
                            </div>
                          )}
                          <span className="absolute right-2 top-2 z-10 rounded-full bg-warm-beige/90 px-2 py-0.5 font-body text-[10px] font-medium uppercase tracking-widest text-dark-taupe">
                            Closet
                          </span>
                          <div className="aspect-square bg-muted">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.url}
                              alt={item.name ?? ""}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <p className="truncate px-2 pb-2 pt-5 font-body text-xs text-foreground">
                            {item.designer ?? item.name ?? "—"}
                          </p>
                        </button>
                      );
                    }
                    const shop = row.shop;
                    return (
                      <Link
                        key={row.key}
                        href={`/board/${shop.sourceBoardId}`}
                        className="relative overflow-hidden rounded-xl border border-border bg-card text-left transition-all hover:shadow-md"
                      >
                        <span className="absolute right-2 top-2 z-10 rounded-full bg-foreground/90 px-2 py-0.5 font-body text-[10px] font-medium uppercase tracking-widest text-background">
                          Shop
                        </span>
                        <div className="aspect-square bg-muted">
                          {shop.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={shop.imageUrl}
                              alt={shop.title ?? ""}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : null}
                        </div>
                        <p className="truncate px-2 pb-2 pt-5 font-body text-xs text-foreground">
                          {shop.designer ?? shop.title ?? "—"}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Looks tab — every styleboard delivered to this client across all
            sessions, newest first. Favorited state is no longer the gate;
            users can't get back into the closed chat so this view is the
            only durable access. Each card links to the public SharedBoard
            view at /board/[boardId]. */}
        <TabsContent value="looks" className="mt-6">
          {looksStylists.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="mr-1 font-body text-xs uppercase tracking-widest text-muted-foreground">
                Stylist
              </span>
              {looksStylists.map((name) => {
                const active = looksStylistFilter.has(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleLooksStylist(name)}
                    className={cn(
                      "rounded-full border px-3 py-1 font-body text-xs transition-colors",
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-foreground hover:bg-muted",
                    )}
                  >
                    {name}
                  </button>
                );
              })}
              {looksStylistFilter.size > 0 && (
                <button
                  type="button"
                  onClick={() => setLooksStylistFilter(new Set())}
                  className="ml-1 font-body text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          <p className="mb-4 font-body text-xs uppercase tracking-widest text-muted-foreground">
            {filteredLooks.length}{" "}
            {filteredLooks.length === 1 ? "Look" : "Looks"}
          </p>

          {filteredLooks.length === 0 ? (
            <p className="py-20 text-center text-sm text-muted-foreground">
              {looks.length === 0
                ? "No looks yet. Looks delivered by your stylist will appear here."
                : "No looks match the current filters."}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-3">
              {filteredLooks.map((look) => (
                <Link
                  key={look.boardId}
                  href={`/board/${look.boardId}`}
                  className="group relative block overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-md"
                >
                  <div className="aspect-square overflow-hidden bg-muted">
                    {look.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={look.thumbnailUrl}
                        alt={look.title ?? "Styleboard"}
                        className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : null}
                  </div>
                  <p className="truncate px-3 pb-3 pt-2 font-body text-xs text-muted-foreground">
                    Styled by {look.stylistName} ·{" "}
                    {new Date(look.sentAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

      </Tabs>

      {/* Floating Add Item button — Loveable Profile.tsx:1214-1220 */}
      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="fixed bottom-8 right-8 z-30 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 font-body text-sm font-medium text-background shadow-lg transition-all hover:bg-foreground/90 hover:shadow-xl"
      >
        <Plus className="h-4 w-4" /> Add Item
      </button>

      <AddItemDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onItemCreated={handleItemAdded}
      />

      <ClosetItemDialog
        item={detailItem}
        outfits={detailItem ? outfitsByItemId[detailItem.id] ?? [] : []}
        open={detailItem !== null}
        onOpenChange={(open) => {
          if (!open) setDetailItem(null);
        }}
        onDelete={async (id) => {
          await deleteSingleItem(id);
        }}
      />
    </>
  );
}

interface AddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onItemCreated: (item: ClosetItem) => void;
}

function AddItemDialog({ open, onOpenChange, onItemCreated }: AddDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webUrl, setWebUrl] = useState("");

  async function uploadFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const presign = await fetch(
        `/api/closet?presign=1&filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type)}`,
        { method: "POST" },
      );
      if (!presign.ok) throw new Error("upload-url failed");
      const { uploadUrl, key, publicUrl } = (await presign.json()) as {
        uploadUrl: string;
        key: string;
        publicUrl: string;
      };
      const put = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type },
      });
      if (!put.ok) throw new Error("s3 put failed");
      const created = await fetch("/api/closet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ s3Key: key, url: publicUrl }),
      });
      if (!created.ok) throw new Error("create failed");
      onItemCreated((await created.json()) as ClosetItem);
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFromWeb() {
    if (!webUrl.trim()) {
      setError("Paste a product URL first");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/closet/from-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: webUrl.trim() }),
      });
      if (res.status !== 201 && res.status !== 202) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Couldn't add from web");
      }
      const body = (await res.json()) as {
        item: ClosetItem;
        partial?: boolean;
      };
      onItemCreated(body.item);
      setWebUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "URL upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Add Item</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <label className="flex w-full cursor-pointer items-center gap-4 rounded-xl border border-border p-4 hover:bg-muted">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
              <Camera className="h-5 w-5 text-foreground" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium text-foreground">
                Take a Photo
              </span>
              <span className="block text-xs text-muted-foreground">
                Use your camera
              </span>
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadFile(f);
              }}
            />
          </label>
          <label className="flex w-full cursor-pointer items-center gap-4 rounded-xl border border-border p-4 hover:bg-muted">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
              <ImageIcon className="h-5 w-5 text-foreground" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium text-foreground">
                Photo Library
              </span>
              <span className="block text-xs text-muted-foreground">
                Choose from your device
              </span>
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadFile(f);
              }}
            />
          </label>

          <div className="rounded-xl border border-border p-4">
            <div className="mb-3 flex items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
                <Globe className="h-5 w-5 text-foreground" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Upload from Web
                </p>
                <p className="text-xs text-muted-foreground">
                  Paste a product link from any retailer
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Input
                type="url"
                value={webUrl}
                onChange={(e) => setWebUrl(e.target.value)}
                placeholder="https://…"
                disabled={busy}
              />
              <Button
                type="button"
                onClick={() => void uploadFromWeb()}
                disabled={busy}
              >
                Add
              </Button>
            </div>
          </div>

          {busy && <p className="text-sm text-muted-foreground">Working…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

