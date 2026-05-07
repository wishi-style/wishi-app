import type { Gender } from "@/generated/prisma/client";
import type { ProductSearchDoc } from "./types";

/**
 * Tastegraph stores `gender` as lowercase free-text ("men" / "women" / etc.),
 * not the Prisma enum. Map our enum to the value the inventory service expects.
 * NON_BINARY and PREFER_NOT_TO_SAY map to undefined so the call is unfiltered —
 * stylist still sees the full catalog rather than an empty page.
 */
export function mapGenderToInventory(
  gender: Gender | null | undefined,
): string | undefined {
  if (gender === "MALE") return "men";
  if (gender === "FEMALE") return "women";
  return undefined;
}

interface ClientPreferences {
  avoidBrands: readonly string[];
  preferredBrands: readonly string[];
  dislikedColors: readonly string[];
  likedColors: readonly string[];
  dislikedFabrics: readonly string[];
}

function normalize(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function normalizeSet(values: readonly string[]): Set<string> {
  return new Set(values.map(normalize).filter(Boolean));
}

/**
 * Drop products the client has explicitly opted out of: brands on the avoid
 * list, primary fabric on the disliked list, or any color family the client
 * marked as disliked. Tastegraph does not expose exclusion filters, so this
 * runs after the server-side fetch.
 */
export function filterOutClientDislikes<T extends ProductSearchDoc>(
  products: T[],
  prefs: Pick<
    ClientPreferences,
    "avoidBrands" | "dislikedColors" | "dislikedFabrics"
  >,
): T[] {
  const avoid = normalizeSet(prefs.avoidBrands);
  const dislikedColors = normalizeSet(prefs.dislikedColors);
  const dislikedFabrics = normalizeSet(prefs.dislikedFabrics);

  if (avoid.size === 0 && dislikedColors.size === 0 && dislikedFabrics.size === 0) {
    return products;
  }

  return products.filter((p) => {
    if (avoid.size > 0 && avoid.has(normalize(p.brand_name))) return false;
    if (dislikedFabrics.size > 0 && dislikedFabrics.has(normalize(p.primary_fabric))) {
      return false;
    }
    if (dislikedColors.size > 0) {
      const colors = (p.color_families ?? []).map(normalize);
      if (colors.some((c) => dislikedColors.has(c))) return false;
    }
    return true;
  });
}

/**
 * Stable-sort the list so products matching the client's preferred brands
 * surface first, then liked-color matches, then everything else. Stylist
 * still sees the full filtered catalog — this only changes order.
 */
export function rankByClientLikes<T extends ProductSearchDoc>(
  products: T[],
  prefs: Pick<ClientPreferences, "preferredBrands" | "likedColors">,
): T[] {
  const preferred = normalizeSet(prefs.preferredBrands);
  const liked = normalizeSet(prefs.likedColors);

  if (preferred.size === 0 && liked.size === 0) return products;

  return products
    .map((product, index) => {
      const brandMatch = preferred.size > 0 && preferred.has(normalize(product.brand_name));
      const colorMatch =
        liked.size > 0 &&
        (product.color_families ?? []).map(normalize).some((c) => liked.has(c));
      const score = (brandMatch ? 2 : 0) + (colorMatch ? 1 : 0);
      return { product, index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.product);
}
