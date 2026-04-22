import type { ClosetItem } from "@/generated/prisma/client";

export type ClosetFilterKey = "designer" | "season" | "color" | "category";

export type ClosetFilters = Partial<Record<ClosetFilterKey, string>>;

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

/**
 * Apply selected filters to the closet item list. Each filter is independent
 * (AND-combined). `color` matches against the array; the others match the
 * exact string. Pure function — extracted from the closet client component.
 */
export function filterClosetItems(
  items: ClosetItem[],
  filters: ClosetFilters,
): ClosetItem[] {
  return items.filter((it) => {
    if (filters.designer && it.designer !== filters.designer) return false;
    if (filters.season && it.season !== filters.season) return false;
    if (filters.category && it.category !== filters.category) return false;
    if (filters.color && !it.colors.includes(filters.color)) return false;
    return true;
  });
}
