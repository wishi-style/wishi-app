/**
 * Shared normalizers used when creating ClosetItem rows from any source
 * (manual upload, URL scrape, order auto-create). Keeps the Designer /
 * Season / Color / Category filters in Profile → Closet consistent.
 */

export function normalizeDesigner(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed
    .split(/\s+/)
    .map((w) =>
      w.length <= 3 && w === w.toUpperCase()
        ? w
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(" ");
}

/**
 * Derive a season from a month + category. Outerwear in Nov–Feb is FALL_WINTER,
 * swim + shorts in May–Aug is SPRING_SUMMER, etc. Falls back to YEAR_ROUND.
 */
export function deriveSeason(
  category: string | null | undefined,
  now: Date = new Date(),
): string {
  const m = now.getUTCMonth(); // 0–11
  const cold = m <= 1 || m >= 9; // Jan/Feb/Oct/Nov/Dec
  const warm = m >= 4 && m <= 7; // May–Aug

  const cat = (category ?? "").toLowerCase();
  if (["outerwear", "coat", "jacket", "boots", "knit"].some((t) => cat.includes(t))) {
    return cold ? "FALL_WINTER" : "YEAR_ROUND";
  }
  if (["swim", "shorts", "linen", "tank"].some((t) => cat.includes(t))) {
    return warm ? "SPRING_SUMMER" : "YEAR_ROUND";
  }
  return "YEAR_ROUND";
}

const COLOR_FAMILIES = new Set([
  "black",
  "white",
  "gray",
  "grey",
  "navy",
  "blue",
  "green",
  "red",
  "pink",
  "purple",
  "yellow",
  "orange",
  "brown",
  "beige",
  "cream",
  "gold",
  "silver",
  "multi",
]);

export function canonicalizeColors(
  raw: string[] | null | undefined,
): string[] {
  if (!raw || raw.length === 0) return [];
  const mapped = raw.map((c) => c.toLowerCase().trim()).filter(Boolean);
  // Keep known families verbatim; unknown colors pass through lowercased.
  return [...new Set(mapped.map((c) => (COLOR_FAMILIES.has(c) ? c : c)))];
}
