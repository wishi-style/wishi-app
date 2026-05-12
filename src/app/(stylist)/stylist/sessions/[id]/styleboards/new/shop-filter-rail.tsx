"use client";

import {
  ChevronDownIcon,
  ChevronRightIcon,
  PanelLeftCloseIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  StarIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { CategoryBucket } from "@/lib/inventory/adapt-product-doc";
import type { ClientStylingContextSummary } from "@/lib/inventory/client-context";
import type { ShopInventoryFilters } from "@/lib/inventory/shop-inventory.defaults";
import type { FilterValuesResponse } from "@/lib/inventory/types";

interface ShopFilterRailProps {
  value: ShopInventoryFilters;
  onChange: (patch: Partial<ShopInventoryFilters>) => void;
  facets: FilterValuesResponse;
  clientContext: ClientStylingContextSummary;
  category: CategoryBucket;
  onCategoryChange: (next: CategoryBucket) => void;
  onCollapse: () => void;
  onClearAll: () => void;
  onResetToProfile: () => void;
}

// Tastegraph returns 35 categories as a flat list. Group them by the chrome's
// 5 buckets so the rail mirrors how a stylist thinks: tops / bottoms /
// outerwear / shoes / accessories. Slugs that don't match any bucket fall
// into a "Misc" group at the bottom.
const BUCKET_BY_SLUG_RX: Array<{
  bucket: Exclude<CategoryBucket, "all">;
  pattern: RegExp;
}> = [
  { bucket: "outerwear", pattern: /(blazer|coat|jacket|outerwear|cardigan|vest)/i },
  { bucket: "shoes", pattern: /(shoe|boot|sneaker|sandal|loafer|heel|pump|mule|slipper)/i },
  { bucket: "accessories", pattern: /(accessor|bag|belt|backpack|clutch|hat|jewel|scarf|sunglass|wallet|tote|crossbody|earring|ring|necklace|bracelet)/i },
  { bucket: "bottoms", pattern: /(pant|jean|trouser|skirt|short|legging)/i },
  { bucket: "tops", pattern: /(top|shirt|blouse|tee|tank|sweater|knit|polo|dress|jumpsuit|romper|swim|lingerie|bra)/i },
];

const BUCKET_LABELS: Record<Exclude<CategoryBucket, "all">, string> = {
  tops: "Tops & Dresses",
  bottoms: "Bottoms",
  outerwear: "Outerwear",
  shoes: "Shoes",
  accessories: "Accessories",
};

function bucketForSlug(slug: string): Exclude<CategoryBucket, "all"> | "misc" {
  for (const { bucket, pattern } of BUCKET_BY_SLUG_RX) {
    if (pattern.test(slug)) return bucket;
  }
  return "misc";
}

const FABRIC_TIERS: Array<{ key: string; label: string; hint: string }> = [
  { key: "luxury", label: "Luxury", hint: "Cashmere, silk, alpaca" },
  { key: "premium", label: "Premium", hint: "Wool, leather, linen" },
  { key: "standard", label: "Standard", hint: "Cotton, denim, jersey" },
  { key: "synthetic", label: "Synthetic", hint: "Polyester, nylon" },
];

// Map service `gender` values to user-facing pill labels.
const GENDER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "women", label: "Women" },
  { value: "men", label: "Men" },
  { value: "unisex", label: "Unisex" },
];

// Size systems we group separately so a stylist isn't scrolling past 2k raw
// values. Order matters: shown top→bottom. "us" is the canonical alias.
const SIZE_SYSTEMS_ORDER: Array<{ key: string; label: string }> = [
  { key: "us_alpha", label: "US Letter (XS–XL)" },
  { key: "us_numeric", label: "US Numeric (00–24)" },
  { key: "us_shoe", label: "Shoe Size" },
  { key: "one_size", label: "One size" },
  { key: "eu", label: "EU" },
  { key: "uk", label: "UK" },
  { key: "au", label: "AU" },
  { key: "universal", label: "Universal" },
];

const ALL_COLORS_HEX: Record<string, string> = {
  black: "#1a1a1a",
  white: "#f5f5f5",
  blue: "#2b4d77",
  brown: "#5a3a26",
  metallic: "#c9c5b8",
  red: "#a93535",
  neutral: "#c8b89b",
  pink: "#e9b7c7",
  green: "#3e6b48",
  grey: "#9b9b9b",
  yellow: "#d6c25c",
  multicolor: "linear-gradient(90deg,#d35,#3d5,#33d)",
  purple: "#6b4a8a",
  pattern: "repeating-linear-gradient(45deg,#666 0 2px,#fff 2px 4px)",
  orange: "#d97b3c",
  other: "#888",
};

function toggleInSet(arr: readonly string[] | undefined, value: string): string[] {
  const set = new Set(arr ?? []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return Array.from(set);
}

function asNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// -------- section primitives ------------------------------------------------

function Section({
  label,
  defaultOpen = false,
  count,
  onClear,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  count?: number;
  onClear?: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/60 last:border-b-0 pb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-2 group"
      >
        <span className="font-display text-xs font-semibold uppercase tracking-wider text-foreground inline-flex items-center gap-1.5">
          {label}
          {count !== undefined && count > 0 && (
            <span className="inline-flex items-center justify-center min-w-[1rem] h-4 px-1 rounded-full bg-foreground text-background text-[9px] font-medium">
              {count}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          {count !== undefined && count > 0 && onClear && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  onClear();
                }
              }}
              className="font-body text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              Clear
            </span>
          )}
          {open ? (
            <ChevronDownIcon className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </span>
      </button>
      {open && <div className="pt-1 pb-1">{children}</div>}
    </div>
  );
}

function CheckRow({
  label,
  count,
  selected,
  onClick,
  badge,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onClick: () => void;
  badge?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left px-2 py-1.5 rounded-sm font-body text-xs transition-colors flex items-center gap-2",
        selected
          ? "bg-foreground text-background"
          : "text-foreground hover:bg-muted",
      )}
    >
      <span
        className={cn(
          "h-3 w-3 rounded-sm border flex items-center justify-center shrink-0",
          selected
            ? "bg-background border-background"
            : "border-border",
        )}
      >
        {selected && <span className="h-1.5 w-1.5 bg-foreground rounded-[1px]" />}
      </span>
      <span className="truncate flex-1">{label}</span>
      {badge}
      {count !== undefined && (
        <span
          className={cn(
            "text-[10px] tabular-nums shrink-0",
            selected ? "text-background/70" : "text-muted-foreground",
          )}
        >
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}

function Pill({
  label,
  selected,
  onClick,
  hint,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={cn(
        "px-2.5 py-1 rounded-full font-body text-[11px] transition-colors border",
        selected
          ? "bg-foreground text-background border-foreground"
          : "bg-background text-foreground border-border hover:border-foreground",
      )}
    >
      {label}
    </button>
  );
}

function ToggleRow({
  label,
  selected,
  onChange,
  description,
}: {
  label: string;
  selected: boolean;
  onChange: (next: boolean) => void;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!selected)}
      className="w-full flex items-center justify-between px-2 py-2 rounded-sm hover:bg-muted text-left"
    >
      <span className="flex flex-col">
        <span className="font-body text-xs text-foreground">{label}</span>
        {description && (
          <span className="font-body text-[10px] text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      <span
        className={cn(
          "h-4 w-7 rounded-full p-0.5 transition-colors shrink-0",
          selected ? "bg-foreground" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "block h-3 w-3 rounded-full bg-background shadow transition-transform",
            selected ? "translate-x-3" : "translate-x-0",
          )}
        />
      </span>
    </button>
  );
}

// -------- main component ----------------------------------------------------

export function ShopFilterRail({
  value,
  onChange,
  facets,
  clientContext,
  category,
  onCategoryChange,
  onCollapse,
  onClearAll,
  onResetToProfile,
}: ShopFilterRailProps) {
  // Search-within-section state.
  const [brandSearch, setBrandSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [expandedColorFamily, setExpandedColorFamily] = useState<string | null>(
    null,
  );
  const [activeSizeSystem, setActiveSizeSystem] = useState<string>("us_alpha");

  // -------- derived helpers -------------------------------------------------

  // Brands by id for label lookup (chip rendering, ★ pinned preferred).
  const brandById = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of facets.brands) map.set(b.id, b.name);
    return map;
  }, [facets.brands]);

  const preferredBrandIds = useMemo(() => {
    const lowerSet = new Set(
      clientContext.preferredBrandNames.map((n) => n.toLowerCase()),
    );
    return new Set(
      facets.brands
        .filter((b) => lowerSet.has(b.name.toLowerCase()))
        .map((b) => b.id),
    );
  }, [facets.brands, clientContext.preferredBrandNames]);

  const visibleBrands = useMemo(() => {
    const q = brandSearch.trim().toLowerCase();
    const filtered = q
      ? facets.brands.filter((b) => b.name.toLowerCase().includes(q))
      : facets.brands;
    // Preferred first, alphabetical inside each tier.
    return [...filtered].sort((a, b) => {
      const pa = preferredBrandIds.has(a.id) ? 0 : 1;
      const pb = preferredBrandIds.has(b.id) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name);
    });
  }, [brandSearch, facets.brands, preferredBrandIds]);

  // Bucketize the flat category facet list.
  const groupedCategories = useMemo(() => {
    const groups = new Map<string, FilterValuesResponse["categories"]>();
    for (const cat of facets.categories) {
      const b = bucketForSlug(cat.slug);
      const arr = groups.get(b) ?? [];
      arr.push(cat);
      groups.set(b, arr);
    }
    for (const [, arr] of groups) {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    }
    return groups;
  }, [facets.categories]);

  // Map category UUID → bucket so picking a category also drives smart-defaults.
  const bucketByCategoryId = useMemo(() => {
    const map = new Map<string, Exclude<CategoryBucket, "all">>();
    for (const cat of facets.categories) {
      const b = bucketForSlug(cat.slug);
      if (b !== "misc") map.set(cat.id, b);
    }
    return map;
  }, [facets.categories]);

  const filteredCategoryGroups = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return groupedCategories;
    const out = new Map<string, FilterValuesResponse["categories"]>();
    for (const [bucket, list] of groupedCategories) {
      const matching = list.filter((c) =>
        c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q),
      );
      if (matching.length > 0) out.set(bucket, matching);
    }
    return out;
  }, [groupedCategories, categorySearch]);

  const sizesBySystem = useMemo(() => {
    const map = new Map<string, FilterValuesResponse["sizes"]>();
    for (const s of facets.sizes) {
      const arr = map.get(s.system) ?? [];
      arr.push(s);
      map.set(s.system, arr);
    }
    for (const [, arr] of map) {
      arr.sort((a, b) => b.count - a.count);
    }
    return map;
  }, [facets.sizes]);

  // Client's known size, if any, for the current bucket — used to surface
  // "✓ Sarah's size" hint in the size section.
  const clientSizeForBucket = useMemo(() => {
    if (category === "all") return null;
    return clientContext.sizesByCategory[category] ?? null;
  }, [category, clientContext.sizesByCategory]);

  // Client's budget range, for the slider hint + default fill.
  const clientBudgetForBucket = useMemo(() => {
    if (category === "all") return null;
    return clientContext.budgetsByCategory[category] ?? null;
  }, [category, clientContext.budgetsByCategory]);

  // -------- handlers --------------------------------------------------------

  const setCategoryId = (id: string | undefined) => {
    if (!id) {
      onChange({ categoryId: undefined });
      onCategoryChange("all");
      return;
    }
    onChange({ categoryId: id });
    const bucket = bucketByCategoryId.get(id);
    if (bucket) onCategoryChange(bucket);
  };

  // -------- counters for the section headers --------------------------------

  const counts = {
    category: value.categoryId ? 1 : category !== "all" ? 1 : 0,
    price: value.minPrice !== undefined || value.maxPrice !== undefined ? 1 : 0,
    color: (value.colors?.length ?? 0) + (value.subColors?.length ?? 0),
    brand: value.brandIds?.length ?? 0,
    retailer: value.merchantIds?.length ?? 0,
    size: value.sizes?.length ?? 0,
    fabric:
      (value.primaryFabrics?.length ?? 0) +
      (value.fabricTiers?.length ?? 0) +
      (value.excludeLeather ? 1 : 0),
    pattern: value.patterns?.length ?? 0,
    gender: value.gender ? 1 : 0,
    availability: value.inStockOnly ? 1 : 0,
  };

  const totalActive = Object.values(counts).reduce((a, b) => a + b, 0);

  // -------- render ----------------------------------------------------------

  const minPrice = asNumber(value.minPrice, 0);
  const maxPrice = asNumber(value.maxPrice, 5000);
  const PRICE_CAP = 5000;

  return (
    <aside className="w-[256px] shrink-0 border-r border-border bg-muted/20 p-3 flex flex-col overflow-y-auto relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
          <SlidersHorizontalIcon className="h-3 w-3" /> Filters
          {totalActive > 0 && (
            <span className="inline-flex items-center justify-center min-w-[1rem] h-4 px-1 rounded-full bg-foreground text-background text-[9px] font-medium">
              {totalActive}
            </span>
          )}
        </span>
        <button
          onClick={onCollapse}
          title="Hide filters"
          aria-label="Hide filters"
          className="h-6 w-6 rounded-sm flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <PanelLeftCloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* "Tuned for Sarah" reset block — present whenever the stylist has
          touched filters; clicking restores the client-derived defaults and
          wipes the explicit overrides. */}
      {totalActive > 0 && (
        <div className="mb-3 px-2 py-2 rounded-sm bg-background border border-border">
          <p className="font-body text-[11px] text-muted-foreground mb-1.5">
            {totalActive} filter{totalActive === 1 ? "" : "s"} applied
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onResetToProfile}
              className="font-body text-[11px] text-foreground underline underline-offset-2 hover:no-underline"
            >
              Reset to {clientContext.clientFirstName}&apos;s profile
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              type="button"
              onClick={onClearAll}
              className="font-body text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Clear all
            </button>
          </div>
        </div>
      )}

      {/* ----- CATEGORY ----- */}
      <Section
        label="Category"
        defaultOpen
        count={counts.category}
        onClear={() => setCategoryId(undefined)}
      >
        <div className="relative mb-2">
          <SearchIcon className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={categorySearch}
            onChange={(e) => setCategorySearch(e.target.value)}
            placeholder="Search categories"
            className="w-full pl-7 pr-2 py-1.5 bg-background border border-border rounded-sm font-body text-[11px] focus:outline-none focus:border-foreground"
          />
        </div>
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {Array.from(filteredCategoryGroups.entries()).map(([bucket, list]) => (
            <div key={bucket}>
              <p className="font-body text-[10px] uppercase tracking-wider text-muted-foreground px-2 mb-0.5">
                {bucket in BUCKET_LABELS
                  ? BUCKET_LABELS[bucket as Exclude<CategoryBucket, "all">]
                  : "Other"}
              </p>
              <div className="space-y-0.5">
                {list.map((cat) => {
                  const selected = value.categoryId === cat.id;
                  return (
                    <CheckRow
                      key={cat.id}
                      label={cat.name}
                      selected={selected}
                      onClick={() =>
                        setCategoryId(selected ? undefined : cat.id)
                      }
                    />
                  );
                })}
              </div>
            </div>
          ))}
          {filteredCategoryGroups.size === 0 && (
            <p className="font-body text-[11px] text-muted-foreground italic px-2">
              No matches for &ldquo;{categorySearch}&rdquo;
            </p>
          )}
        </div>
      </Section>

      {/* ----- PRICE ----- */}
      <Section
        label="Price"
        defaultOpen
        count={counts.price}
        onClear={() => onChange({ minPrice: undefined, maxPrice: undefined })}
      >
        <div className="px-1.5">
          {clientBudgetForBucket && (
            <p className="font-body text-[10px] text-muted-foreground mb-2">
              {clientContext.clientFirstName}&apos;s {category} budget:{" "}
              <span className="text-foreground">
                ${Math.round(clientBudgetForBucket[0] / 100)}–$
                {Math.round(clientBudgetForBucket[1] / 100)}
              </span>
            </p>
          )}
          <Slider
            min={0}
            max={PRICE_CAP}
            step={50}
            value={[minPrice, Math.min(maxPrice, PRICE_CAP)]}
            onValueChange={(v) => {
              const arr = v as readonly number[];
              onChange({
                minPrice: arr[0] === 0 ? undefined : arr[0],
                maxPrice: arr[1] >= PRICE_CAP ? undefined : arr[1],
              });
            }}
            className="my-2"
          />
          <div className="flex items-center justify-between font-body text-[11px] tabular-nums text-foreground">
            <span>${minPrice.toLocaleString()}</span>
            <span>
              {maxPrice >= PRICE_CAP
                ? `$${PRICE_CAP.toLocaleString()}+`
                : `$${maxPrice.toLocaleString()}`}
            </span>
          </div>
        </div>
      </Section>

      {/* ----- COLOR ----- */}
      <Section
        label="Color"
        defaultOpen
        count={counts.color}
        onClear={() => onChange({ colors: undefined, subColors: undefined })}
      >
        <div className="grid grid-cols-4 gap-2 px-1 mb-2">
          {facets.colors.filter((c) => c.value !== "pattern").map((c) => {
            const selected = value.colors?.includes(c.value) ?? false;
            const bg = ALL_COLORS_HEX[c.value] ?? "#888";
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => {
                  const next = toggleInSet(value.colors, c.value);
                  onChange({ colors: next.length ? next : undefined });
                  if (!selected) {
                    setExpandedColorFamily(c.value);
                  } else if (expandedColorFamily === c.value) {
                    setExpandedColorFamily(null);
                  }
                }}
                title={`${c.value} · ${c.count.toLocaleString()}`}
                className={cn(
                  "h-9 rounded-sm border-2 flex flex-col items-center justify-center transition-all",
                  selected
                    ? "border-foreground"
                    : "border-border hover:border-foreground/50",
                )}
                style={{
                  background: bg.startsWith("linear-gradient")
                    || bg.startsWith("repeating")
                    ? bg
                    : undefined,
                  backgroundColor:
                    bg.startsWith("linear-gradient") ||
                    bg.startsWith("repeating")
                      ? undefined
                      : bg,
                }}
              >
                <span className="sr-only">{c.value}</span>
              </button>
            );
          })}
        </div>

        {/* Sub-color drawer for the expanded family */}
        {expandedColorFamily &&
          (facets.subColorsByFamily[expandedColorFamily]?.length ?? 0) > 0 && (
            <div className="mt-3 pt-2 border-t border-border/60">
              <div className="flex items-center justify-between mb-1.5">
                <p className="font-body text-[10px] uppercase tracking-wider text-muted-foreground">
                  Shades of {expandedColorFamily}
                </p>
                <button
                  type="button"
                  onClick={() => setExpandedColorFamily(null)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Hide shades"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto pr-1">
                {facets.subColorsByFamily[expandedColorFamily]
                  .slice(0, 80)
                  .map((sub) => {
                    const selected = value.subColors?.includes(sub) ?? false;
                    return (
                      <Pill
                        key={sub}
                        label={sub}
                        selected={selected}
                        onClick={() => {
                          const next = toggleInSet(value.subColors, sub);
                          onChange({
                            subColors: next.length ? next : undefined,
                          });
                        }}
                      />
                    );
                  })}
              </div>
            </div>
          )}
      </Section>

      {/* ----- PATTERN ----- */}
      {(facets.subColorsByFamily.pattern?.length ?? 0) > 0 && (
        <Section
          label="Pattern"
          count={counts.pattern}
          onClear={() => onChange({ patterns: undefined })}
        >
          <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto pr-1">
            {facets.subColorsByFamily.pattern.slice(0, 40).map((p) => {
              const selected = value.patterns?.includes(p) ?? false;
              return (
                <Pill
                  key={p}
                  label={p}
                  selected={selected}
                  onClick={() => {
                    const next = toggleInSet(value.patterns, p);
                    onChange({ patterns: next.length ? next : undefined });
                  }}
                />
              );
            })}
          </div>
        </Section>
      )}

      {/* ----- BRAND ----- */}
      <Section
        label="Brand"
        count={counts.brand}
        onClear={() => onChange({ brandIds: undefined })}
      >
        <div className="relative mb-2">
          <SearchIcon className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={brandSearch}
            onChange={(e) => setBrandSearch(e.target.value)}
            placeholder={`Search ${facets.brands.length.toLocaleString()} brands`}
            className="w-full pl-7 pr-2 py-1.5 bg-background border border-border rounded-sm font-body text-[11px] focus:outline-none focus:border-foreground"
          />
        </div>

        {value.brandIds && value.brandIds.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {value.brandIds.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-foreground text-background font-body text-[10px]"
              >
                {brandById.get(id) ?? id}
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      brandIds: (value.brandIds ?? []).filter((x) => x !== id),
                    })
                  }
                  aria-label={`Remove ${brandById.get(id) ?? id}`}
                >
                  <XIcon className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="space-y-0.5 max-h-56 overflow-y-auto pr-1">
          {visibleBrands.slice(0, 200).map((b) => {
            const selected = value.brandIds?.includes(b.id) ?? false;
            const preferred = preferredBrandIds.has(b.id);
            return (
              <CheckRow
                key={b.id}
                label={b.name}
                selected={selected}
                onClick={() => {
                  const next = toggleInSet(value.brandIds, b.id);
                  onChange({ brandIds: next.length ? next : undefined });
                }}
                badge={
                  preferred ? (
                    <StarIcon className="h-3 w-3 fill-foreground text-foreground shrink-0" />
                  ) : undefined
                }
              />
            );
          })}
          {visibleBrands.length > 200 && (
            <p className="font-body text-[10px] text-muted-foreground italic px-2 pt-1">
              {(visibleBrands.length - 200).toLocaleString()} more — refine the
              search to see them.
            </p>
          )}
        </div>
      </Section>

      {/* ----- RETAILER ----- */}
      <Section
        label="Retailer"
        count={counts.retailer}
        onClear={() => onChange({ merchantIds: undefined })}
      >
        <div className="space-y-0.5">
          {facets.merchants.map((m) => {
            const selected = value.merchantIds?.includes(m.id) ?? false;
            return (
              <CheckRow
                key={m.id}
                label={m.name}
                selected={selected}
                onClick={() => {
                  const next = toggleInSet(value.merchantIds, m.id);
                  onChange({ merchantIds: next.length ? next : undefined });
                }}
              />
            );
          })}
        </div>
      </Section>

      {/* ----- SIZE ----- */}
      <Section
        label="Size"
        count={counts.size}
        onClear={() => onChange({ sizes: undefined })}
      >
        {clientSizeForBucket && (
          <div className="px-2 mb-2">
            <p className="font-body text-[10px] text-muted-foreground">
              {clientContext.clientFirstName}&apos;s {category} size:{" "}
              <button
                type="button"
                onClick={() => {
                  if (!value.sizes?.includes(clientSizeForBucket)) {
                    onChange({
                      sizes: [...(value.sizes ?? []), clientSizeForBucket],
                    });
                  }
                }}
                className="text-foreground underline underline-offset-2 hover:no-underline"
              >
                {clientSizeForBucket}
              </button>
            </p>
          </div>
        )}
        {/* Size-system tabs */}
        <div className="flex flex-wrap gap-1 mb-2">
          {SIZE_SYSTEMS_ORDER.filter(
            (sys) => (sizesBySystem.get(sys.key)?.length ?? 0) > 0,
          ).map((sys) => (
            <button
              key={sys.key}
              type="button"
              onClick={() => setActiveSizeSystem(sys.key)}
              className={cn(
                "px-2 py-1 rounded-sm font-body text-[10px] transition-colors",
                activeSizeSystem === sys.key
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {sys.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto pr-1">
          {(sizesBySystem.get(activeSizeSystem) ?? [])
            .slice(0, 60)
            .map((s) => {
              const selected = value.sizes?.includes(s.value) ?? false;
              return (
                <Pill
                  key={`${s.system}-${s.value}`}
                  label={s.value}
                  selected={selected}
                  onClick={() => {
                    const next = toggleInSet(value.sizes, s.value);
                    onChange({ sizes: next.length ? next : undefined });
                  }}
                  hint={`${s.count.toLocaleString()} items`}
                />
              );
            })}
        </div>
      </Section>

      {/* ----- FABRIC ----- */}
      <Section
        label="Fabric"
        count={counts.fabric}
        onClear={() =>
          onChange({
            primaryFabrics: undefined,
            fabricTiers: undefined,
            excludeLeather: undefined,
          })
        }
      >
        <div>
          <p className="font-body text-[10px] uppercase tracking-wider text-muted-foreground px-2 mb-1.5">
            Tier
          </p>
          <div className="grid grid-cols-2 gap-1 mb-3 px-1">
            {FABRIC_TIERS.map((tier) => {
              const selected = value.fabricTiers?.includes(tier.key) ?? false;
              return (
                <button
                  key={tier.key}
                  type="button"
                  onClick={() => {
                    const next = toggleInSet(value.fabricTiers, tier.key);
                    onChange({
                      fabricTiers: next.length ? next : undefined,
                    });
                  }}
                  title={tier.hint}
                  className={cn(
                    "px-2 py-1.5 rounded-sm font-body text-[11px] border transition-colors text-center",
                    selected
                      ? "bg-foreground text-background border-foreground"
                      : "bg-background text-foreground border-border hover:border-foreground",
                  )}
                >
                  {tier.label}
                </button>
              );
            })}
          </div>
          <p className="font-body text-[10px] uppercase tracking-wider text-muted-foreground px-2 mb-1.5">
            Material
          </p>
          <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto pr-1 mb-3">
            {facets.primaryFabrics.slice(0, 30).map((f) => {
              const selected = value.primaryFabrics?.includes(f.value) ?? false;
              return (
                <Pill
                  key={f.value}
                  label={f.value}
                  selected={selected}
                  onClick={() => {
                    const next = toggleInSet(value.primaryFabrics, f.value);
                    onChange({
                      primaryFabrics: next.length ? next : undefined,
                    });
                  }}
                  hint={`${f.count.toLocaleString()} items`}
                />
              );
            })}
          </div>
          <ToggleRow
            label="Exclude leather"
            description="Hide leather & faux-leather pieces"
            selected={value.excludeLeather === true}
            onChange={(v) => onChange({ excludeLeather: v ? true : undefined })}
          />
        </div>
      </Section>

      {/* ----- GENDER ----- */}
      <Section
        label="Gender"
        count={counts.gender}
        onClear={() => onChange({ gender: undefined })}
      >
        <div className="flex flex-wrap gap-1 px-1">
          {GENDER_OPTIONS.map((g) => (
            <Pill
              key={g.value}
              label={g.label}
              selected={value.gender === g.value}
              onClick={() =>
                onChange({
                  gender: value.gender === g.value ? undefined : g.value,
                })
              }
            />
          ))}
        </div>
      </Section>

      {/* ----- AVAILABILITY ----- */}
      <Section
        label="Availability"
        count={counts.availability}
        onClear={() => onChange({ inStockOnly: undefined })}
      >
        <ToggleRow
          label="In stock only"
          description="Skip out-of-stock listings"
          selected={value.inStockOnly === true}
          onChange={(v) => onChange({ inStockOnly: v ? true : undefined })}
        />
      </Section>
    </aside>
  );
}
