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
  SlidersHorizontalIcon,
  XIcon,
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
import type { CollectionWithPreview } from "@/lib/collections/collection.service";
import {
  computeClosetFacets,
  filterClosetItems,
  type ClosetFilterKey as FilterKey,
  type ClosetFilters,
} from "@/lib/closet/filter";

interface Look {
  id: string;
  boardId: string;
  sessionId: string | null;
  title: string | null;
  thumbnailUrl: string | null;
}

interface Props {
  initialItems: ClosetItem[];
  looks: Look[];
  collections: CollectionWithPreview[];
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
  looks,
  collections: initialCollections,
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [collections, setCollections] = useState(initialCollections);
  const [filters, setFilters] = useState<ClosetFilters>({});
  const [openFilter, setOpenFilter] = useState<FilterKey | null>("category");
  const [addOpen, setAddOpen] = useState(false);
  const [looksTab, setLooksTab] = useState<"styleboards" | "favorites">(
    "styleboards",
  );
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gridSize, setGridSize] = useState<"normal" | "compact">("normal");

  const facets = useMemo(() => computeClosetFacets(items), [items]);
  const filteredItems = useMemo(
    () => filterClosetItems(items, filters),
    [items, filters],
  );

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

  async function createCollection(name: string): Promise<void> {
    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Couldn't create collection");
    }
    const created = (await res.json()) as { id: string; name: string };
    setCollections((p) => [
      {
        id: created.id,
        name: created.name,
        coverImageUrl: null,
        itemCount: 0,
        previewImages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      ...p,
    ]);
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
          <TabsTrigger
            value="collections"
            className="rounded-none border-b-2 border-transparent px-0 pb-3 text-base data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Collections
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
                    {filteredItems.length}{" "}
                    {filteredItems.length === 1 ? "Item" : "Items"}
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

              {filteredItems.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  {items.length === 0
                    ? "Your closet is empty. Add an item to get started."
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
                  {filteredItems.map((item) => {
                    const isSelected = selected.has(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (selectMode) toggleItemSelect(item.id);
                          // Outside select mode the tile is non-interactive
                          // for now — Loveable opens a ClosetItemDialog
                          // detail view here, that port is deferred.
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
                  })}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Looks tab — favorited styleboards */}
        <TabsContent value="looks" className="mt-6">
          {/* Pill sub-tabs + mobile filter button — Loveable Profile.tsx:1042-1064.
              Loveable's desktop sidebar (Stylist/Occasion/Season/Style) and
              filter chip row are deferred — the data needs to be enriched on
              the Look type from the Board → Session → StylistProfile chain
              + Board.occasion / season / style fields that don't exist yet.
              Tracked under Phase 11 polish in WISHI-REBUILD-PLAN.md. */}
          <div className="mb-4 flex items-center gap-3">
            <button
              type="button"
              aria-label="Open filters"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border transition-colors hover:bg-muted/50 lg:hidden"
            >
              <SlidersHorizontalIcon className="h-4 w-4 text-muted-foreground" />
            </button>
            <button
              type="button"
              onClick={() => setLooksTab("styleboards")}
              className={cn(
                "rounded-full px-5 py-2 font-body text-sm font-medium transition-colors",
                looksTab === "styleboards"
                  ? "bg-foreground text-background"
                  : "bg-muted text-foreground hover:bg-muted/80",
              )}
            >
              Style boards
            </button>
            <button
              type="button"
              onClick={() => setLooksTab("favorites")}
              className={cn(
                "rounded-full px-5 py-2 font-body text-sm font-medium transition-colors",
                looksTab === "favorites"
                  ? "bg-foreground text-background"
                  : "bg-muted text-foreground hover:bg-muted/80",
              )}
            >
              Favorites
            </button>
          </div>

          <p className="mb-4 font-body text-xs uppercase tracking-widest text-muted-foreground">
            {looks.length} {looks.length === 1 ? "Look" : "Looks"}
          </p>

          {looks.length === 0 ? (
            <p className="py-20 text-center text-sm text-muted-foreground">
              No saved looks yet. Tap the heart on a styleboard to save it here.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-3">
              {looks.map((look) => (
                <Link
                  key={look.id}
                  href={
                    look.sessionId ? `/sessions/${look.sessionId}` : `/profile`
                  }
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
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Collections tab — preview grid + create */}
        <TabsContent value="collections" className="mt-6">
          <div className="mb-5 flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {collections.length}{" "}
              {collections.length === 1 ? "Collection" : "Collections"}
            </p>
            <CreateCollectionButton onCreate={createCollection} />
          </div>
          {collections.length === 0 ? (
            <p className="py-20 text-center text-sm text-muted-foreground">
              No collections yet. Create one to group items by occasion or
              season.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
              {collections.map((c) => (
                <Link
                  key={c.id}
                  href={`/collections/${c.id}`}
                  className="group block overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-md"
                >
                  <div className="grid grid-cols-4 gap-1.5 p-3 pb-0">
                    {Array.from({ length: 4 }).map((_, i) => {
                      const url = c.previewImages[i];
                      return (
                        <div
                          key={i}
                          className="aspect-[3/4] overflow-hidden rounded-md bg-muted"
                        >
                          {url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={url}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-end justify-between p-4 pt-3">
                    <div>
                      <p className="font-display text-base text-foreground">
                        {c.name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {c.itemCount}{" "}
                        {c.itemCount === 1 ? "item" : "items"}
                      </p>
                    </div>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full transition-colors group-hover:bg-muted">
                      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
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

function CreateCollectionButton({
  onCreate,
}: {
  onCreate: (name: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(name.trim());
      setOpen(false);
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create collection");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" className="rounded-full" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New Collection
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              New Collection
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Spring Capsule"
              maxLength={80}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              className="w-full"
              onClick={submit}
              disabled={busy || !name.trim()}
            >
              {busy ? "Creating…" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
