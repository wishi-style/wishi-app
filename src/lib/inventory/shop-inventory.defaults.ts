import type { CategoryBucket } from "./adapt-product-doc";
import type { ClientStylingContext } from "./client-context";

/**
 * The set of filter fields that can be auto-populated from a client's profile
 * before the stylist touches anything. Each "applied default" carries enough
 * detail to render a removable chip ("Size M tops × · Tuned for Sarah") and
 * lets the stylist dismiss it back out.
 *
 * The defaults service is intentionally a pure function:
 *   (context, explicit, category, dismissed) → { merged, applied }
 * Same inputs in, same output out. Tested in isolation.
 */

export type SmartDefaultKind =
  | "gender"
  | "size"
  | "budget"
  | "in_stock"
  | "exclude_leather";

export interface AppliedSmartDefault {
  kind: SmartDefaultKind;
  /** Human-readable explanation for the chip. */
  reason: string;
  /** Patch applied on top of explicit filters to produce the merged set. */
  filterPatch: Partial<ShopInventoryFilters>;
}

/**
 * The chrome's filter shape. `mode` uses the stylist-facing vocabulary
 * (`smart` vs `keyword`) — the shop-inventory service maps it to tastegraph's
 * (`semantic` vs `fts`) inside the orchestration layer.
 */
export interface ShopInventoryFilters {
  query?: string;
  mode?: "smart" | "keyword";
  merchantIds?: string[];
  brandIds?: string[];
  categoryId?: string;
  /** Service color_families values. */
  colors?: string[];
  /** Service color_normalized values (sub-colors); applied client-side
   *  post-fetch in v1 — service has no first-class filter yet. */
  subColors?: string[];
  /** Service-tagged size values (the same value the size facet emits). */
  sizes?: string[];
  primaryFabrics?: string[];
  /** "luxury" | "premium" | "standard" | "synthetic"; client-side post-fetch
   *  filter in v1 — service doesn't yet expose tier as a DTO field. */
  fabricTiers?: string[];
  excludeLeather?: boolean;
  inStockOnly?: boolean;
  minPrice?: number;
  maxPrice?: number;
  gender?: string;
  sort?: "relevance" | "newest" | "price_asc" | "price_desc" | "in_stock_first";
}

function hasOwn<T extends object>(
  obj: T,
  key: keyof T,
): obj is T & Record<typeof key, NonNullable<T[typeof key]>> {
  const v = obj[key];
  if (v === undefined || v === null) return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

/**
 * Compute the smart-default chips and merged filter set for a given
 * stylist-explicit filter object + category bucket.
 *
 * Ladder (applied only when the stylist has NOT explicitly set the same field
 * AND the default kind is NOT in `dismissed`):
 *   1. Gender    — from MatchQuiz / User.gender via `mapGenderToInventory`.
 *   2. In stock  — `inStockOnly: true`. Stylists almost always want shoppable.
 *   3. Size      — from `BodyProfile.sizes[<bucket>]` if present.
 *   4. Budget    — from `BudgetByCategory[<bucket>]` → minPrice/maxPrice. Only
 *                  fires when a category bucket is selected (not "all").
 *   5. Exclude leather — when client has explicitly disliked leather.
 *
 * Brand-prefer / colour-like are NOT applied as hard filters (over-constrain);
 * the existing `rankByClientLikes` post-fetch sort handles them as soft
 * ranking signals.
 */
export function deriveSmartDefaults(
  ctx: ClientStylingContext,
  explicit: ShopInventoryFilters,
  category: CategoryBucket,
  dismissed: ReadonlySet<SmartDefaultKind>,
): { merged: ShopInventoryFilters; applied: AppliedSmartDefault[] } {
  const applied: AppliedSmartDefault[] = [];
  const merged: ShopInventoryFilters = { ...explicit };

  const can = (kind: SmartDefaultKind) => !dismissed.has(kind);
  const firstName = ctx.clientFirstName;

  // 1. Gender
  if (
    can("gender") &&
    !hasOwn(explicit, "gender") &&
    ctx.inventoryGender
  ) {
    merged.gender = ctx.inventoryGender;
    applied.push({
      kind: "gender",
      reason: `Shopping ${ctx.inventoryGender}'s`,
      filterPatch: { gender: ctx.inventoryGender },
    });
  }

  // 2. In stock
  if (can("in_stock") && !hasOwn(explicit, "inStockOnly")) {
    merged.inStockOnly = true;
    applied.push({
      kind: "in_stock",
      reason: "In stock only",
      filterPatch: { inStockOnly: true },
    });
  }

  // 3. Size — only meaningful for a specific category bucket
  if (
    can("size") &&
    category !== "all" &&
    !hasOwn(explicit, "sizes")
  ) {
    const size = ctx.sizesByCategory[category];
    if (size) {
      merged.sizes = [size];
      applied.push({
        kind: "size",
        reason: `${firstName}'s size: ${size} ${category}`,
        filterPatch: { sizes: [size] },
      });
    }
  }

  // 4. Budget — also category-scoped
  if (category !== "all" && can("budget")) {
    const budget = ctx.budgetsByCategory[category];
    if (budget) {
      const [lo, hi] = budget;
      const patch: Partial<ShopInventoryFilters> = {};
      if (!hasOwn(explicit, "minPrice")) {
        merged.minPrice = lo;
        patch.minPrice = lo;
      }
      if (!hasOwn(explicit, "maxPrice")) {
        merged.maxPrice = hi;
        patch.maxPrice = hi;
      }
      if (Object.keys(patch).length > 0) {
        applied.push({
          kind: "budget",
          reason: `${firstName}'s budget: $${lo}–$${hi}`,
          filterPatch: patch,
        });
      }
    }
  }

  // 5. Exclude leather
  if (
    can("exclude_leather") &&
    ctx.excludeLeatherByDefault &&
    !hasOwn(explicit, "excludeLeather")
  ) {
    merged.excludeLeather = true;
    applied.push({
      kind: "exclude_leather",
      reason: `${firstName} avoids leather`,
      filterPatch: { excludeLeather: true },
    });
  }

  return { merged, applied };
}
