"use client";

// LookCreator — drag-drop canvas for stylists composing a styleboard.
// Source panel (inventory / closet / inspiration / web URL) on the left,
// 1:1 canvas on the right. Items persist x/y on drop; save dialog collects
// title + description + tags and fires /send.
//
// Scope-wise a condensed version of Loveable's 1552-LOC LookCreator — the
// advanced affordances (bg-removal, crop, flip, retailer/availability/color
// filters, favorites, "previous looks" tab, keyboard canvas-size shortcuts)
// are tracked in WISHI-REBUILD-PLAN.md under Phase 12 deferred follow-ups.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeftIcon,
  SearchIcon,
  Trash2Icon,
  UserIcon,
  SendIcon,
  ShirtIcon,
  StoreIcon,
  SparklesIcon,
  XIcon,
  ArrowUpToLineIcon,
  ArrowDownToLineIcon,
  EraserIcon,
  LinkIcon,
  SlidersHorizontalIcon,
  FlipHorizontalIcon,
  FlipVerticalIcon,
  ScissorsIcon,
  HeartIcon,
  Minimize2Icon,
  SquareIcon,
  Maximize2Icon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { SaveLookDialog } from "@/components/stylist/save-look-dialog";
import type {
  BoardItem,
  BoardItemSource,
  ClosetItem,
  InspirationPhoto,
} from "@/generated/prisma/client";
import type {
  FilterValuesResponse,
  ProductSearchDoc,
  SearchQueryDto,
  SearchResponse,
} from "@/lib/inventory/types";

type Tab = "inventory" | "closet" | "inspiration" | "web";

interface Props {
  boardId: string;
  sessionId: string;
  isRevision: boolean;
  clientId: string;
  clientName: string;
  initialItems: BoardItem[];
  closetItems: ClosetItem[];
  inspiration: InspirationPhoto[];
}

interface CanvasItem {
  id: string;
  source: BoardItemSource;
  inventoryProductId: string | null;
  imageUrl: string | null;
  label: string | null;
  x: number; // percent 0-100
  y: number; // percent 0-100
  zIndex: number;
  flipH: boolean;
  flipV: boolean;
  crop: { top: number; right: number; bottom: number; left: number } | null;
}

type CanvasSize = "min" | "small" | "large";
const canvasSizeClass: Record<CanvasSize, string> = {
  min: "max-w-[480px]",
  small: "max-w-[640px]",
  large: "max-w-[880px]",
};

const MIN_ITEMS = 3;
const MAX_ITEMS = 12;
const TILE_PERCENT = 22; // item tile width/height as % of canvas

function toCanvasItem(item: BoardItem, fallbackIndex: number): CanvasItem {
  const crop =
    item.cropTop != null ||
    item.cropRight != null ||
    item.cropBottom != null ||
    item.cropLeft != null
      ? {
          top: item.cropTop ?? 0,
          right: item.cropRight ?? 0,
          bottom: item.cropBottom ?? 0,
          left: item.cropLeft ?? 0,
        }
      : null;
  return {
    id: item.id,
    source: item.source,
    inventoryProductId: item.inventoryProductId ?? null,
    imageUrl: item.webItemImageUrl ?? null,
    label:
      item.webItemTitle ?? item.inventoryProductId ?? item.webItemUrl ?? null,
    x: item.x ?? 20 + (fallbackIndex % 4) * 20,
    y: item.y ?? 20 + Math.floor(fallbackIndex / 4) * 22,
    zIndex: item.zIndex ?? fallbackIndex,
    flipH: item.flipH ?? false,
    flipV: item.flipV ?? false,
    crop,
  };
}

export function StyleboardBuilder({
  boardId,
  sessionId,
  isRevision,
  clientId,
  clientName,
  initialItems,
  closetItems,
  inspiration,
}: Props) {
  const router = useRouter();
  const canvasRef = useRef<HTMLDivElement>(null);

  const [canvas, setCanvas] = useState<CanvasItem[]>(() =>
    initialItems.map((it, idx) => {
      const base = toCanvasItem(it, idx);
      // Hydrate image url from joined sources for existing drafts
      if (it.source === "CLOSET") {
        const c = closetItems.find((x) => x.id === it.closetItemId);
        if (c) {
          base.imageUrl = c.url;
          base.label = c.name ?? c.designer ?? null;
        }
      } else if (it.source === "INSPIRATION_PHOTO") {
        const i = inspiration.find((x) => x.id === it.inspirationPhotoId);
        if (i) {
          base.imageUrl = i.url;
          base.label = i.title ?? null;
        }
      } else if (it.source === "WEB_ADDED") {
        base.imageUrl = it.webItemImageUrl;
        base.label = it.webItemTitle ?? it.webItemUrl ?? null;
      }
      return base;
    }),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("inventory");
  const [search, setSearch] = useState("");
  const [inventoryResults, setInventoryResults] = useState<ProductSearchDoc[]>([]);
  const [webUrl, setWebUrl] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>("small");
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set());
  const [cropTargetId, setCropTargetId] = useState<string | null>(null);

  // Advanced filter state — populated from /api/products/filters, used by
  // runInventorySearch to narrow the tastegraph query.
  const [filterValues, setFilterValues] = useState<FilterValuesResponse | null>(null);
  const [selectedMerchants, setSelectedMerchants] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 5000]);
  const [inStockOnly, setInStockOnly] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/products/filters");
        if (res.ok) {
          const data = (await res.json()) as FilterValuesResponse;
          setFilterValues(data);
        }
      } catch {
        /* non-fatal; filters just won't populate */
      }
    })();
  }, []);

  // Fetch the stylist's favorited items once so the source-tile heart
  // reflects prior state.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/favorites/items");
        if (res.ok) {
          const data = (await res.json()) as {
            items: Array<{ inventoryProductId: string | null }>;
          };
          setFavoritedIds(
            new Set(
              data.items
                .map((f) => f.inventoryProductId)
                .filter((id): id is string => !!id),
            ),
          );
        }
      } catch {
        /* non-fatal */
      }
    })();
  }, []);

  // Keyboard shortcuts: 1/2/3 switch canvas size. Ignored when the user is
  // typing in an input / textarea / search field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "1") setCanvasSize("min");
      else if (e.key === "2") setCanvasSize("small");
      else if (e.key === "3") setCanvasSize("large");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function toggleFavorite(productId: string) {
    const had = favoritedIds.has(productId);
    const next = new Set(favoritedIds);
    if (had) next.delete(productId);
    else next.add(productId);
    setFavoritedIds(next);
    try {
      if (had) {
        await fetch(
          `/api/favorites/items?inventoryProductId=${encodeURIComponent(productId)}`,
          { method: "DELETE" },
        );
      } else {
        await fetch("/api/favorites/items", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ inventoryProductId: productId }),
        });
      }
    } catch {
      // Roll back local state if the network write failed.
      setFavoritedIds(favoritedIds);
    }
  }

  async function flipItem(id: string, axis: "h" | "v") {
    const item = canvas.find((c) => c.id === id);
    if (!item) return;
    const nextFlipH = axis === "h" ? !item.flipH : item.flipH;
    const nextFlipV = axis === "v" ? !item.flipV : item.flipV;
    setCanvas((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, flipH: nextFlipH, flipV: nextFlipV } : c,
      ),
    );
    await fetch(`/api/styleboards/${boardId}/items/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ flipH: nextFlipH, flipV: nextFlipV }),
    });
  }

  async function applyCrop(
    id: string,
    crop: { top: number; right: number; bottom: number; left: number } | null,
  ) {
    setCanvas((prev) =>
      prev.map((c) => (c.id === id ? { ...c, crop } : c)),
    );
    await fetch(`/api/styleboards/${boardId}/items/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cropTop: crop?.top ?? null,
        cropRight: crop?.right ?? null,
        cropBottom: crop?.bottom ?? null,
        cropLeft: crop?.left ?? null,
      }),
    });
  }

  const dragData = useRef<{
    source: BoardItemSource;
    imageUrl: string | null;
    label: string | null;
    payload: Record<string, unknown>;
  } | null>(null);
  const movingId = useRef<string | null>(null);

  const maxZ = useMemo(
    () => canvas.reduce((m, c) => Math.max(m, c.zIndex), 0),
    [canvas],
  );

  async function runInventorySearch() {
    setError(null);
    const dto: SearchQueryDto = {
      query: search || undefined,
      merchantIds: selectedMerchants.length ? selectedMerchants : undefined,
      colors: selectedColors.length ? selectedColors : undefined,
      sizes: selectedSizes.length ? selectedSizes : undefined,
      minPrice: priceRange[0] > 0 ? priceRange[0] : undefined,
      maxPrice: priceRange[1] < 5000 ? priceRange[1] : undefined,
      inStockOnly: inStockOnly || undefined,
      pageSize: 24,
    };
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(dto),
    });
    if (!res.ok) {
      setError("Inventory search failed");
      setInventoryResults([]);
      return;
    }
    const data = (await res.json()) as SearchResponse;
    setInventoryResults(data.results ?? []);
  }

  function resetFilters() {
    setSelectedMerchants([]);
    setSelectedColors([]);
    setSelectedSizes([]);
    setPriceRange([0, 5000]);
    setInStockOnly(true);
  }

  const activeFilterCount =
    selectedMerchants.length +
    selectedColors.length +
    selectedSizes.length +
    (priceRange[0] > 0 || priceRange[1] < 5000 ? 1 : 0) +
    (inStockOnly ? 0 : 1); // in-stock default is ON, so only count off as "changed"

  function findFreeSlot(): { x: number; y: number } {
    const occupied = (px: number, py: number) =>
      canvas.some(
        (c) => Math.abs(c.x - px) < TILE_PERCENT && Math.abs(c.y - py) < TILE_PERCENT,
      );
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const x = 20 + c * 20;
        const y = 20 + r * 22;
        if (!occupied(x, y)) return { x, y };
      }
    }
    return { x: 50, y: 50 };
  }

  async function addItem(
    source: BoardItemSource,
    payload: Record<string, unknown>,
    imageUrl: string | null,
    label: string | null,
    dropX?: number,
    dropY?: number,
  ) {
    if (canvas.length >= MAX_ITEMS) {
      toast(`Maximum ${MAX_ITEMS} items on canvas`);
      return;
    }
    const slot =
      dropX != null && dropY != null ? { x: dropX, y: dropY } : findFreeSlot();
    const z = maxZ + 1;
    const res = await fetch(`/api/styleboards/${boardId}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source, ...payload, x: slot.x, y: slot.y, zIndex: z }),
    });
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      setError(b.error ?? "Add failed");
      toast.error(b.error ?? "Add failed");
      return;
    }
    const created = (await res.json()) as BoardItem;
    setCanvas((prev) => [
      ...prev,
      {
        id: created.id,
        source: created.source,
        inventoryProductId: created.inventoryProductId ?? null,
        imageUrl: imageUrl ?? created.webItemImageUrl ?? null,
        label,
        x: created.x ?? slot.x,
        y: created.y ?? slot.y,
        zIndex: created.zIndex ?? z,
        flipH: false,
        flipV: false,
        crop: null,
      },
    ]);
  }

  async function removeItem(id: string) {
    const prev = canvas;
    setCanvas((c) => c.filter((it) => it.id !== id));
    if (selectedId === id) setSelectedId(null);
    const res = await fetch(`/api/styleboards/${boardId}/items/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) setCanvas(prev);
  }

  async function repositionItem(id: string, x: number, y: number) {
    setCanvas((prev) =>
      prev.map((c) => (c.id === id ? { ...c, x, y } : c)),
    );
    await fetch(`/api/styleboards/${boardId}/items/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ x, y }),
    });
  }

  async function changeZIndex(id: string, z: number) {
    setCanvas((prev) => prev.map((c) => (c.id === id ? { ...c, zIndex: z } : c)));
    await fetch(`/api/styleboards/${boardId}/items/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ zIndex: z }),
    });
  }

  async function clearCanvas() {
    if (!confirm(`Remove all ${canvas.length} items from this look?`)) return;
    const prev = canvas;
    const ids = prev.map((c) => c.id);
    setCanvas([]);
    setSelectedId(null);
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/styleboards/${boardId}/items/${id}`, {
          method: "DELETE",
        }).then((res) => {
          if (!res.ok) throw new Error(`delete ${id} → ${res.status}`);
          return id;
        }),
      ),
    );
    const rejected = results
      .map((r, i) => ({ r, id: ids[i] }))
      .filter(({ r }) => r.status === "rejected")
      .map(({ id }) => id);
    if (rejected.length > 0) {
      // Restore only the items whose DELETE failed server-side — the ones
      // that succeeded stay gone.
      setCanvas(prev.filter((c) => rejected.includes(c.id)));
      toast.error(
        `Could not remove ${rejected.length} item${rejected.length === 1 ? "" : "s"}`,
      );
    }
  }

  function handleCanvasDrop(e: React.DragEvent) {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const clampedX = Math.min(90, Math.max(10, x));
    const clampedY = Math.min(90, Math.max(10, y));
    if (movingId.current) {
      const id = movingId.current;
      movingId.current = null;
      void repositionItem(id, clampedX, clampedY);
      return;
    }
    if (dragData.current) {
      const d = dragData.current;
      dragData.current = null;
      void addItem(d.source, d.payload, d.imageUrl, d.label, clampedX, clampedY);
    }
  }

  async function sendBoard(input: {
    title: string;
    description: string;
    tags: string[];
  }) {
    const res = await fetch(`/api/styleboards/${boardId}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(b.error ?? "Send failed");
    }
    setSaveOpen(false);
    toast.success(`"${input.title}" sent to ${clientName}`);
    router.push(`/stylist/sessions/${sessionId}/workspace`);
    router.refresh();
  }

  async function addWebItem() {
    if (!webUrl.trim()) return;
    await addItem(
      "WEB_ADDED",
      { webItemUrl: webUrl.trim() },
      null,
      webUrl.trim(),
    );
    setWebUrl("");
  }

  const tabs: { id: Tab; label: string; icon: typeof ShirtIcon }[] = [
    { id: "inventory", label: "Shop", icon: StoreIcon },
    { id: "closet", label: "Closet", icon: ShirtIcon },
    { id: "inspiration", label: "Inspiration", icon: SparklesIcon },
    { id: "web", label: "Web URL", icon: LinkIcon },
  ];

  const canSave = canvas.length >= MIN_ITEMS;

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
              {isRevision ? "Create restyle" : "Create a look"}
            </h1>
            <p className="font-body text-xs text-muted-foreground">
              for {clientName} · {canvas.length}/{MAX_ITEMS} items
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/stylist/clients/${clientId}`}
            className="inline-flex items-center gap-1.5 h-8 rounded-sm border border-border px-3 font-body text-xs hover:bg-muted transition-colors"
          >
            <UserIcon className="h-3.5 w-3.5" />
            Client info
          </Link>
          {canvas.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void clearCanvas()}
              className="font-body text-xs text-muted-foreground h-8 gap-1"
            >
              <Trash2Icon className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
          <Button
            onClick={() => setSaveOpen(true)}
            disabled={!canSave}
            size="sm"
            title={!canSave ? `Add ${MIN_ITEMS - canvas.length} more item(s) to enable` : undefined}
            className="h-8 rounded-sm bg-foreground text-background hover:bg-foreground/90 font-body text-xs gap-1.5"
          >
            <SendIcon className="h-3.5 w-3.5" />
            Save &amp; send
            {!canSave && ` (${canvas.length}/${MIN_ITEMS})`}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 px-5 py-2 text-xs text-red-700">{error}</div>
      )}

      {/* Source tabs */}
      <div className="flex items-center gap-1 px-5 border-b border-border shrink-0">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2.5 font-body text-xs border-b-2 -mb-px transition-colors",
                active
                  ? "border-foreground text-foreground font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Main split */}
      <div className="flex flex-1 overflow-hidden">
        {/* Source library */}
        <div className="w-[380px] shrink-0 border-r border-border flex flex-col min-h-0">
          {tab === "inventory" && (
            <>
              <div className="flex gap-2 px-4 py-3 border-b border-border">
                <div className="relative flex-1">
                  <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search products…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void runInventorySearch();
                    }}
                    className="h-8 pl-8 font-body text-xs rounded-sm"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setFiltersOpen((v) => !v)}
                  className="h-8 rounded-sm font-body text-xs gap-1.5"
                >
                  <SlidersHorizontalIcon className="h-3.5 w-3.5" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-foreground text-background text-[10px] px-1">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void runInventorySearch()}
                  className="h-8 rounded-sm font-body text-xs"
                >
                  Search
                </Button>
              </div>
              {filtersOpen && filterValues && (
                <FilterPanel
                  filterValues={filterValues}
                  selectedMerchants={selectedMerchants}
                  selectedColors={selectedColors}
                  selectedSizes={selectedSizes}
                  priceRange={priceRange}
                  inStockOnly={inStockOnly}
                  activeFilterCount={activeFilterCount}
                  onMerchants={setSelectedMerchants}
                  onColors={setSelectedColors}
                  onSizes={setSelectedSizes}
                  onPriceRange={setPriceRange}
                  onInStockOnly={setInStockOnly}
                  onReset={resetFilters}
                  onApply={() => {
                    setFiltersOpen(false);
                    void runInventorySearch();
                  }}
                />
              )}
              <ScrollArea className="flex-1">
                <div className="grid grid-cols-2 gap-2 p-3">
                  {inventoryResults.map((p) => (
                    <SourceTile
                      key={p.id}
                      imageUrl={p.primary_image_url ?? null}
                      label={p.canonical_name}
                      sublabel={p.brand_name}
                      favorited={favoritedIds.has(p.id)}
                      onFavoriteToggle={() => void toggleFavorite(p.id)}
                      onAdd={() =>
                        void addItem(
                          "INVENTORY",
                          { inventoryProductId: p.id },
                          p.primary_image_url ?? null,
                          p.canonical_name,
                        )
                      }
                      onDragStart={() => {
                        dragData.current = {
                          source: "INVENTORY",
                          imageUrl: p.primary_image_url ?? null,
                          label: p.canonical_name,
                          payload: { inventoryProductId: p.id },
                        };
                      }}
                    />
                  ))}
                  {inventoryResults.length === 0 && (
                    <p className="col-span-2 px-2 py-6 font-body text-xs text-muted-foreground text-center">
                      Search the inventory to start adding items.
                    </p>
                  )}
                </div>
              </ScrollArea>
            </>
          )}

          {tab === "closet" && (
            <ScrollArea className="flex-1">
              <div className="grid grid-cols-2 gap-2 p-3">
                {closetItems.map((c) => (
                  <SourceTile
                    key={c.id}
                    imageUrl={c.url}
                    label={c.name ?? "Closet item"}
                    sublabel={c.designer ?? "Client closet"}
                    onAdd={() =>
                      void addItem(
                        "CLOSET",
                        { closetItemId: c.id },
                        c.url,
                        c.name ?? null,
                      )
                    }
                    onDragStart={() => {
                      dragData.current = {
                        source: "CLOSET",
                        imageUrl: c.url,
                        label: c.name ?? null,
                        payload: { closetItemId: c.id },
                      };
                    }}
                  />
                ))}
                {closetItems.length === 0 && (
                  <p className="col-span-2 px-2 py-6 font-body text-xs text-muted-foreground text-center">
                    Client&apos;s closet is empty.
                  </p>
                )}
              </div>
            </ScrollArea>
          )}

          {tab === "inspiration" && (
            <ScrollArea className="flex-1">
              <div className="grid grid-cols-2 gap-2 p-3">
                {inspiration.map((i) => (
                  <SourceTile
                    key={i.id}
                    imageUrl={i.url}
                    label={i.title ?? "Inspiration"}
                    sublabel="Inspiration"
                    onAdd={() =>
                      void addItem(
                        "INSPIRATION_PHOTO",
                        { inspirationPhotoId: i.id },
                        i.url,
                        i.title ?? null,
                      )
                    }
                    onDragStart={() => {
                      dragData.current = {
                        source: "INSPIRATION_PHOTO",
                        imageUrl: i.url,
                        label: i.title ?? null,
                        payload: { inspirationPhotoId: i.id },
                      };
                    }}
                  />
                ))}
              </div>
            </ScrollArea>
          )}

          {tab === "web" && (
            <div className="p-4 space-y-2">
              <Input
                placeholder="https://…"
                value={webUrl}
                onChange={(e) => setWebUrl(e.target.value)}
                className="h-8 rounded-sm font-body text-xs"
              />
              <Button
                size="sm"
                onClick={() => void addWebItem()}
                className="w-full h-8 rounded-sm font-body text-xs"
              >
                Add web item
              </Button>
              <p className="font-body text-[11px] text-muted-foreground">
                Paste a retailer URL — we&apos;ll use it as a styling reference.
                The client sees the link in the styleboard.
              </p>
            </div>
          )}
        </div>

        {/* Canvas */}
        <div className="flex-1 flex flex-col items-center justify-center bg-muted/20 p-6 overflow-auto min-h-0 gap-3">
          <CanvasSizeToggle value={canvasSize} onChange={setCanvasSize} />
          <div
            ref={canvasRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleCanvasDrop}
            onClick={() => setSelectedId(null)}
            className={cn(
              "relative w-full aspect-square rounded-sm border-2 border-dashed border-border bg-background overflow-hidden",
              canvasSizeClass[canvasSize],
            )}
          >
            {canvas.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
                <p className="font-body text-sm text-muted-foreground">
                  Drag items onto the canvas
                </p>
                <p className="font-body text-xs text-muted-foreground/60 mt-1">
                  Or click a source item to drop it in the next open slot
                </p>
              </div>
            )}
            {canvas.map((c) => {
              const transform =
                c.flipH || c.flipV
                  ? `scale(${c.flipH ? -1 : 1}, ${c.flipV ? -1 : 1})`
                  : undefined;
              const clipPath = c.crop
                ? `inset(${c.crop.top}% ${c.crop.right}% ${c.crop.bottom}% ${c.crop.left}%)`
                : undefined;
              return (
                <div
                  key={c.id}
                  draggable
                  onDragStart={() => {
                    movingId.current = c.id;
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(c.id);
                  }}
                  style={{
                    left: `${c.x}%`,
                    top: `${c.y}%`,
                    zIndex: c.zIndex,
                  }}
                  className={cn(
                    "absolute w-[22%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-sm overflow-hidden border-2 bg-card cursor-move transition-shadow",
                    selectedId === c.id
                      ? "border-foreground shadow-lg"
                      : "border-transparent hover:border-border",
                  )}
                >
                  {c.imageUrl ? (
                    <Image
                      src={c.imageUrl}
                      alt={c.label ?? ""}
                      fill
                      className="object-cover pointer-events-none"
                      sizes="200px"
                      style={{ transform, clipPath }}
                      unoptimized
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted p-1 text-center text-[10px] text-muted-foreground">
                      {c.label ?? "Item"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {selectedId && (
            <SelectionBar
              onRemove={() => void removeItem(selectedId)}
              onFront={() => void changeZIndex(selectedId, maxZ + 1)}
              onBack={() => void changeZIndex(selectedId, 0)}
              onFlipH={() => void flipItem(selectedId, "h")}
              onFlipV={() => void flipItem(selectedId, "v")}
              onCrop={() => setCropTargetId(selectedId)}
              onBgRemove={() =>
                toast("Background removal coming soon — Phase 7 feature")
              }
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      </div>

      <SaveLookDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        clientName={clientName}
        onSend={sendBoard}
      />

      {cropTargetId && (
        <CropDialog
          item={canvas.find((c) => c.id === cropTargetId) ?? null}
          onClose={() => setCropTargetId(null)}
          onApply={(crop) => {
            void applyCrop(cropTargetId, crop);
            setCropTargetId(null);
          }}
        />
      )}
    </div>
  );
}

function CanvasSizeToggle({
  value,
  onChange,
}: {
  value: CanvasSize;
  onChange: (v: CanvasSize) => void;
}) {
  const options: { key: CanvasSize; icon: typeof SquareIcon; title: string }[] = [
    { key: "min", icon: Minimize2Icon, title: "Minimize (press 1)" },
    { key: "small", icon: SquareIcon, title: "Small (press 2)" },
    { key: "large", icon: Maximize2Icon, title: "Large (press 3)" },
  ];
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full bg-card border border-border shadow-sm p-1">
      {options.map((o) => {
        const Icon = o.icon;
        const active = value === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            title={o.title}
            className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center transition-colors",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}

function CropDialog({
  item,
  onClose,
  onApply,
}: {
  item: CanvasItem | null;
  onClose: () => void;
  onApply: (
    crop: { top: number; right: number; bottom: number; left: number } | null,
  ) => void;
}) {
  const [top, setTop] = useState(item?.crop?.top ?? 0);
  const [right, setRight] = useState(item?.crop?.right ?? 0);
  const [bottom, setBottom] = useState(item?.crop?.bottom ?? 0);
  const [left, setLeft] = useState(item?.crop?.left ?? 0);
  if (!item) return null;
  const clipPath = `inset(${top}% ${right}% ${bottom}% ${left}%)`;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[420px] rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Crop item</DialogTitle>
          <DialogDescription className="font-body text-xs text-muted-foreground">
            Trim the image from each edge. Values are percent insets.
          </DialogDescription>
        </DialogHeader>
        <div className="aspect-square w-full bg-muted rounded-sm overflow-hidden relative">
          {item.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={{ clipPath }}
            />
          )}
        </div>
        <div className="space-y-3 py-2">
          <CropSlider label="Top" value={top} onChange={setTop} />
          <CropSlider label="Right" value={right} onChange={setRight} />
          <CropSlider label="Bottom" value={bottom} onChange={setBottom} />
          <CropSlider label="Left" value={left} onChange={setLeft} />
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onApply(null)}
            className="h-8 rounded-sm font-body text-xs"
          >
            Reset
          </Button>
          <Button
            size="sm"
            onClick={() => onApply({ top, right, bottom, left })}
            className="h-8 rounded-sm font-body text-xs"
          >
            Apply crop
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CropSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between font-body text-[11px] text-muted-foreground mb-1">
        <span>{label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <Slider
        value={[value]}
        onValueChange={(vals) => {
          const next = Array.isArray(vals) ? vals[0] : vals;
          onChange(next ?? 0);
        }}
        min={0}
        max={40}
        step={1}
      />
    </div>
  );
}

function SourceTile({
  imageUrl,
  label,
  sublabel,
  favorited,
  onAdd,
  onFavoriteToggle,
  onDragStart,
}: {
  imageUrl: string | null;
  label: string;
  sublabel: string | null;
  favorited?: boolean;
  onAdd: () => void;
  onFavoriteToggle?: () => void;
  onDragStart: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="relative group overflow-hidden rounded-sm border border-border bg-card text-left hover:shadow-sm transition-shadow"
    >
      <button
        onClick={onAdd}
        className="block w-full text-left"
        aria-label={`Add ${label} to canvas`}
      >
        <div className="aspect-square bg-muted relative">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={label}
              fill
              className="object-cover"
              sizes="160px"
              unoptimized
            />
          ) : null}
        </div>
        <div className="p-2">
        {sublabel && (
          <p className="font-body text-[10px] uppercase tracking-wider text-muted-foreground truncate">
            {sublabel}
          </p>
        )}
        <p className="font-body text-xs text-foreground truncate">{label}</p>
      </div>
      </button>
      {onFavoriteToggle && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFavoriteToggle();
          }}
          title={favorited ? "Remove from favorites" : "Save to favorites"}
          className="absolute top-2 right-2 h-7 w-7 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-background transition-colors opacity-0 group-hover:opacity-100 data-[favorited=true]:opacity-100"
          data-favorited={favorited ? "true" : "false"}
        >
          <HeartIcon
            className={cn(
              "h-3.5 w-3.5",
              favorited ? "fill-red-500 text-red-500" : "text-foreground",
            )}
          />
        </button>
      )}
    </div>
  );
}

function SelectionBar({
  onRemove,
  onFront,
  onBack,
  onFlipH,
  onFlipV,
  onCrop,
  onBgRemove,
  onClose,
}: {
  onRemove: () => void;
  onFront: () => void;
  onBack: () => void;
  onFlipH: () => void;
  onFlipV: () => void;
  onCrop: () => void;
  onBgRemove: () => void;
  onClose: () => void;
}) {
  return (
    <div className="mt-4 flex items-center gap-1 rounded-full bg-card border border-border shadow-sm px-2 py-1">
      <ToolButton title="Bring to front" onClick={onFront}>
        <ArrowUpToLineIcon className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton title="Send to back" onClick={onBack}>
        <ArrowDownToLineIcon className="h-3.5 w-3.5" />
      </ToolButton>
      <div className="h-4 w-px bg-border mx-1" />
      <ToolButton title="Flip horizontal" onClick={onFlipH}>
        <FlipHorizontalIcon className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton title="Flip vertical" onClick={onFlipV}>
        <FlipVerticalIcon className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton title="Crop" onClick={onCrop}>
        <ScissorsIcon className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton title="Remove background" onClick={onBgRemove}>
        <EraserIcon className="h-3.5 w-3.5" />
      </ToolButton>
      <div className="h-4 w-px bg-border mx-1" />
      <ToolButton title="Remove item" onClick={onRemove}>
        <Trash2Icon className="h-3.5 w-3.5 text-red-600" />
      </ToolButton>
      <ToolButton title="Deselect" onClick={onClose}>
        <XIcon className="h-3.5 w-3.5" />
      </ToolButton>
    </div>
  );
}

function ToolButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="h-7 w-7 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
    >
      {children}
    </button>
  );
}

// Inventory filter panel — retailer chips, color swatches, size chips, and
// a simple numeric budget range wired to tastegraph's SearchQueryDto.
function FilterPanel({
  filterValues,
  selectedMerchants,
  selectedColors,
  selectedSizes,
  priceRange,
  inStockOnly,
  activeFilterCount,
  onMerchants,
  onColors,
  onSizes,
  onPriceRange,
  onInStockOnly,
  onReset,
  onApply,
}: {
  filterValues: FilterValuesResponse;
  selectedMerchants: string[];
  selectedColors: string[];
  selectedSizes: string[];
  priceRange: [number, number];
  inStockOnly: boolean;
  activeFilterCount: number;
  onMerchants: (v: string[]) => void;
  onColors: (v: string[]) => void;
  onSizes: (v: string[]) => void;
  onPriceRange: (v: [number, number]) => void;
  onInStockOnly: (v: boolean) => void;
  onReset: () => void;
  onApply: () => void;
}) {
  function toggle<T>(arr: T[], val: T, setter: (next: T[]) => void) {
    setter(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  }
  return (
    <div className="border-b border-border px-4 py-3 space-y-3 max-h-[50vh] overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ""}
        </h3>
        {activeFilterCount > 0 && (
          <button
            onClick={onReset}
            className="font-body text-[10px] text-muted-foreground hover:text-foreground underline"
          >
            Reset
          </button>
        )}
      </div>

      {filterValues.merchants.length > 0 && (
        <ChipGroup
          label="Retailers"
          options={filterValues.merchants.map((m) => ({ key: m.id, label: m.name }))}
          selected={selectedMerchants}
          onToggle={(k) => toggle(selectedMerchants, k, onMerchants)}
        />
      )}

      {filterValues.colors.length > 0 && (
        <ChipGroup
          label="Colors"
          options={filterValues.colors.map((c) => ({ key: c, label: c }))}
          selected={selectedColors}
          onToggle={(k) => toggle(selectedColors, k, onColors)}
        />
      )}

      {filterValues.sizes.length > 0 && (
        <ChipGroup
          label="Sizes"
          options={filterValues.sizes.map((s) => ({ key: s, label: s }))}
          selected={selectedSizes}
          onToggle={(k) => toggle(selectedSizes, k, onSizes)}
        />
      )}

      <div>
        <label className="block font-display text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
          Price (USD)
        </label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            value={priceRange[0]}
            onChange={(e) =>
              onPriceRange([Number(e.target.value) || 0, priceRange[1]])
            }
            className="h-7 w-20 rounded-sm font-body text-xs"
            aria-label="Min price"
          />
          <span className="font-body text-xs text-muted-foreground">–</span>
          <Input
            type="number"
            min={0}
            value={priceRange[1]}
            onChange={(e) =>
              onPriceRange([priceRange[0], Number(e.target.value) || 0])
            }
            className="h-7 w-20 rounded-sm font-body text-xs"
            aria-label="Max price"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 font-body text-xs">
        <input
          type="checkbox"
          checked={inStockOnly}
          onChange={(e) => onInStockOnly(e.target.checked)}
        />
        In-stock only
      </label>

      <div className="pt-1">
        <Button
          size="sm"
          onClick={onApply}
          className="w-full h-8 rounded-sm font-body text-xs"
        >
          Apply filters
        </Button>
      </div>
    </div>
  );
}

function ChipGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { key: string; label: string }[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div>
      <div className="font-display text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        {label}
      </div>
      <div className="flex flex-wrap gap-1">
        {options.slice(0, 20).map((o) => {
          const active = selected.includes(o.key);
          return (
            <button
              key={o.key}
              onClick={() => onToggle(o.key)}
              className={cn(
                "rounded-sm border px-2 py-1 font-body text-[11px] transition-colors",
                active
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-foreground hover:bg-muted",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
