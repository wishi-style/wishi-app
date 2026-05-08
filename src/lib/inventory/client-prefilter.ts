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
  dislikedPatterns: readonly string[];
}

function normalize(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function normalizeSet(values: readonly string[]): Set<string> {
  return new Set(values.map(normalize).filter(Boolean));
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordBoundaryHit(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  return new RegExp(`\\b${escapeRegex(needle)}\\b`, "i").test(haystack);
}

/**
 * Free-text patterns rarely appear verbatim on a product. "animal_print" never
 * shows up — products are described as leopard, zebra, snake, etc. Map each
 * canonical pattern to its surface vocabulary so the text-match has a chance.
 * Unknown keys fall back to the underscore-stripped pattern as a single token.
 */
const PATTERN_SYNONYMS: Record<string, readonly string[]> = {
  animal_print: [
    "animal print",
    "leopard",
    "zebra",
    "cheetah",
    "snake",
    "snakeskin",
    "tiger",
    "giraffe",
    "python",
    "crocodile",
  ],
  plaid: ["plaid", "tartan", "checkered", "buffalo check", "windowpane"],
  polka_dots: ["polka dot", "polka-dot", "polkadot"],
  floral: ["floral", "flower"],
  geometric: ["geometric"],
  paisley: ["paisley"],
  striped: ["striped", "stripes"],
  camo: ["camo", "camouflage"],
  graphic: ["graphic print"],
  abstract: ["abstract"],
  herringbone: ["herringbone"],
  houndstooth: ["houndstooth"],
};

function patternVariants(p: string): readonly string[] {
  const key = normalize(p).replace(/\s+/g, "_");
  return PATTERN_SYNONYMS[key] ?? [normalize(p).replace(/_/g, " ")];
}

function productText(p: ProductSearchDoc): string {
  return `${p.canonical_name ?? ""} ${p.canonical_description ?? ""}`;
}

/**
 * Brand match: structured field is reliable enough for substring tolerance.
 * "Hermes" should catch "Pre-owned Hermes"; "Coach" catches a hypothetical
 * "Coach 1941". False-positive risk is low because we only test brand_name,
 * not free-text descriptions.
 */
function brandMatchesAvoid(
  p: ProductSearchDoc,
  avoid: Set<string>,
): boolean {
  if (avoid.size === 0) return false;
  const hay = normalize(p.brand_name);
  if (!hay) return false;
  for (const needle of avoid) {
    if (!needle) continue;
    if (hay === needle || hay.includes(needle)) return true;
  }
  return false;
}

/**
 * Color dislike: tastegraph's `color_families` is a normalized 16-value bucket
 * ("black", "pink", "purple", ...) that misses "neon", "fluorescent", and
 * tone variants. Catch those by also scanning `available_colors` (full color
 * names like "hot pink", "neon yellow") and the canonical text. Word-boundary
 * to avoid matching "redo" when the client dislikes "red".
 */
function colorMatchesDislike(
  p: ProductSearchDoc,
  disliked: Set<string>,
): boolean {
  if (disliked.size === 0) return false;
  const families = (p.color_families ?? []).map(normalize);
  const available = (p.available_colors ?? []).map(normalize);
  const text = productText(p);
  for (const needle of disliked) {
    if (!needle) continue;
    if (families.some((f) => f === needle)) return true;
    if (available.some((a) => a.includes(needle))) return true;
    if (wordBoundaryHit(text, needle)) return true;
  }
  return false;
}

/**
 * Fabric dislike: `primary_fabric` is normalized at the doc level ("polyester")
 * but listings carry `material_raw` and `fabric_composition` strings that may
 * say "100% polyester", "polyester blend", "poly-cotton". Match substring on
 * primary_fabric and listings, plus word-boundary on the canonical text.
 */
function fabricMatchesDislike(
  p: ProductSearchDoc,
  disliked: Set<string>,
): boolean {
  if (disliked.size === 0) return false;
  const primary = normalize(p.primary_fabric);
  const listings = p.listings ?? [];
  const text = productText(p);
  for (const needle of disliked) {
    if (!needle) continue;
    if (primary && primary.includes(needle)) return true;
    for (const l of listings) {
      if (normalize(l.primary_fabric).includes(needle)) return true;
      if (normalize(l.material_raw).includes(needle)) return true;
      if (normalize(l.fabric_composition).includes(needle)) return true;
    }
    if (wordBoundaryHit(text, needle)) return true;
  }
  return false;
}

/**
 * Pattern dislike: tastegraph has no doc-level pattern field. Listings carry a
 * `pattern` string. Resolve client patterns through PATTERN_SYNONYMS to get
 * the surface vocabulary, then match against listing.pattern + canonical text.
 */
function patternMatchesDislike(
  p: ProductSearchDoc,
  disliked: readonly string[],
): boolean {
  if (disliked.length === 0) return false;
  const listingPatterns = (p.listings ?? [])
    .map((l) => normalize(l.pattern))
    .filter(Boolean);
  const text = productText(p);
  for (const dis of disliked) {
    for (const variant of patternVariants(dis)) {
      if (!variant) continue;
      if (listingPatterns.some((lp) => lp.includes(variant))) return true;
      if (wordBoundaryHit(text, variant)) return true;
    }
  }
  return false;
}

/**
 * Drop products the client has explicitly opted out of. Each predicate uses
 * the broadest reasonable matcher: brand substring, color/fabric/pattern
 * cross-field substring or word-boundary. Tastegraph exposes no exclusion
 * filters, so this runs after the server-side fetch.
 */
export function filterOutClientDislikes<T extends ProductSearchDoc>(
  products: T[],
  prefs: Pick<
    ClientPreferences,
    "avoidBrands" | "dislikedColors" | "dislikedFabrics" | "dislikedPatterns"
  >,
): T[] {
  const avoid = normalizeSet(prefs.avoidBrands);
  const dislikedColors = normalizeSet(prefs.dislikedColors);
  const dislikedFabrics = normalizeSet(prefs.dislikedFabrics);
  const dislikedPatterns = prefs.dislikedPatterns
    .map((p) => p.trim())
    .filter(Boolean);

  if (
    avoid.size === 0 &&
    dislikedColors.size === 0 &&
    dislikedFabrics.size === 0 &&
    dislikedPatterns.length === 0
  ) {
    return products;
  }

  return products.filter((p) => {
    if (brandMatchesAvoid(p, avoid)) return false;
    if (colorMatchesDislike(p, dislikedColors)) return false;
    if (fabricMatchesDislike(p, dislikedFabrics)) return false;
    if (patternMatchesDislike(p, dislikedPatterns)) return false;
    return true;
  });
}

/**
 * Stable-sort the list so products matching the client's preferred brands
 * surface first, then liked-color matches, then everything else. Stylist
 * still sees the full filtered catalog — this only changes order. Substring
 * tolerance on brand match mirrors the dislike filter.
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
      const brand = normalize(product.brand_name);
      const brandMatch =
        preferred.size > 0 &&
        Array.from(preferred).some((n) => brand === n || brand.includes(n));
      const families = (product.color_families ?? []).map(normalize);
      const available = (product.available_colors ?? []).map(normalize);
      const colorMatch =
        liked.size > 0 &&
        Array.from(liked).some(
          (n) => families.includes(n) || available.some((a) => a.includes(n)),
        );
      const score = (brandMatch ? 2 : 0) + (colorMatch ? 1 : 0);
      return { product, index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.product);
}
