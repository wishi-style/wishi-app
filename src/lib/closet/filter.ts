import type { ClosetItem } from "@/generated/prisma/client";

export type ClosetFilterKey = "designer" | "season" | "color" | "category";

export type ClosetFilters = Partial<Record<ClosetFilterKey, string[]>>;

export interface ClosetFacets {
  designer: string[];
  season: string[];
  color: string[];
  category: string[];
}

/**
 * Compute the available filter facets from the items themselves so the UI
 * never shows a value the user owns zero of. Pure function — extracted from
 * the closet client component so it's directly unit-testable.
 */
export function computeClosetFacets(items: ClosetItem[]): ClosetFacets {
  const collect = (read: (item: ClosetItem) => string | string[] | null): string[] => {
    const set = new Set<string>();
    for (const it of items) {
      const v = read(it);
      if (typeof v === "string" && v) set.add(v);
      if (Array.isArray(v)) for (const x of v) if (typeof x === "string" && x) set.add(x);
    }
    return [...set].sort();
  };
  return {
    designer: collect((it) => it.designer),
    season: collect((it) => it.season),
    color: collect((it) => it.colors),
    category: collect((it) => it.category),
  };
}

function nonEmpty(values: string[] | undefined): string[] | null {
  if (!values || values.length === 0) return null;
  const cleaned = values.filter((v) => typeof v === "string" && v.length > 0);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Apply selected filters to the closet item list. Each dimension OR-combines
 * its own values; dimensions AND-combine across each other (Loveable parity).
 * `color` matches against the item's color array; the rest match the exact
 * scalar field. Empty / missing arrays are treated as "no filter".
 */
export function filterClosetItems(
  items: ClosetItem[],
  filters: ClosetFilters,
): ClosetItem[] {
  const designer = nonEmpty(filters.designer);
  const season = nonEmpty(filters.season);
  const category = nonEmpty(filters.category);
  const color = nonEmpty(filters.color);

  return items.filter((it) => {
    if (designer && !(it.designer && designer.includes(it.designer))) return false;
    if (season && !(it.season && season.includes(it.season))) return false;
    if (category && !(it.category && category.includes(it.category))) return false;
    if (color && !color.some((c) => it.colors.includes(c))) return false;
    return true;
  });
}
