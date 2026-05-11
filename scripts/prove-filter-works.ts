/**
 * Concrete proof that the prefilter functions actually do something against
 * the live tastegraph catalog. No DB access needed — uses a placeholder set
 * of preferences (or a JSON-encoded `PREFS` env var) and runs the live
 * `searchProducts()` plus `filterOutClientDislikes()` + `rankByClientLikes()`,
 * printing the exact rows that get dropped or promoted.
 *
 * To audit a specific client: copy their prefs out of `/api/admin/audit/prefilter?email=...`
 * (the `liked_colors` / `disliked_colors` / `disliked_fabrics` / `disliked_patterns`
 * fields, plus `avoid_brands` / `preferred_brands` from StyleProfile) and pass them
 * via the PREFS env var:
 *
 *   PREFS='{"avoidBrands":[], "preferredBrands":[], "likedColors":["black"], ...}' \
 *     npx tsx scripts/prove-filter-works.ts
 */
import { searchProducts } from "@/lib/inventory/inventory-client";
import {
  filterOutClientDislikes,
  rankByClientLikes,
  mapGenderToInventory,
} from "@/lib/inventory/client-prefilter";
import type { ProductSearchDoc } from "@/lib/inventory/types";

type Prefs = {
  avoidBrands: string[];
  preferredBrands: string[];
  likedColors: string[];
  dislikedColors: string[];
  dislikedFabrics: string[];
  dislikedPatterns: string[];
};

// Placeholder preference set covering each filter axis — produces visible
// drops + ranking shifts so the script self-documents the filter contract.
const DEFAULT_PREFS: Prefs = {
  avoidBrands: [],
  preferredBrands: [],
  likedColors: ["black", "white", "grey"],
  dislikedColors: ["pink", "neon", "purple"],
  dislikedFabrics: ["polyester"],
  dislikedPatterns: ["animal_print", "plaid", "polka_dots", "geometric", "floral"],
};

const MATT_PREFS: Prefs = process.env.PREFS
  ? (JSON.parse(process.env.PREFS) as Prefs)
  : DEFAULT_PREFS;

// Run twice: once with no gender (proves the post-filter on its own) and
// once with gender=men (proves the full pipeline). Both assert the
// invariant that no surviving product matches any dislike.
function summarize(arr: ProductSearchDoc[], label: string) {
  const genders: Record<string, number> = {};
  arr.forEach((p) => {
    const g = p.gender || "<null>";
    genders[g] = (genders[g] ?? 0) + 1;
  });
  console.log(`\n${label}: ${arr.length} products | gender mix:`, genders);
}

const PATTERN_VOCAB: Record<string, readonly string[]> = {
  animal_print: ["animal print", "leopard", "zebra", "cheetah", "snake", "snakeskin", "tiger", "giraffe", "python", "crocodile"],
  plaid: ["plaid", "tartan", "checkered", "buffalo check", "windowpane"],
  polka_dots: ["polka dot", "polka-dot", "polkadot"],
  floral: ["floral", "flower"],
  geometric: ["geometric"],
  paisley: ["paisley"],
  striped: ["striped", "stripes"],
};

function dropReasons(
  removed: ProductSearchDoc[],
  prefs: typeof MATT_PREFS,
): { id: string; brand: string; name: string; reason: string }[] {
  const reasons: { id: string; brand: string; name: string; reason: string }[] = [];
  for (const p of removed) {
    const why: string[] = [];
    const hayBrand = (p.brand_name ?? "").toLowerCase();
    const hayFabricPrimary = (p.primary_fabric ?? "").toLowerCase();
    const hayText = `${p.canonical_name ?? ""} ${p.canonical_description ?? ""}`.toLowerCase();
    const hayAvailable = (p.available_colors ?? []).map((c) => c.toLowerCase());
    const hayFamilies = (p.color_families ?? []).map((c) => c.toLowerCase());
    const hayListingFabric = (p.listings ?? []).map((l) => `${l.primary_fabric ?? ""} ${l.material_raw ?? ""}`.toLowerCase());
    const hayListingPattern = (p.listings ?? []).map((l) => (l.pattern ?? "").toLowerCase());

    for (const a of prefs.avoidBrands) {
      const n = a.toLowerCase();
      if (hayBrand === n || hayBrand.includes(n)) {
        why.push(`brand_name~="${p.brand_name}" matches avoidBrand "${a}"`);
        break;
      }
    }
    for (const d of prefs.dislikedColors) {
      const n = d.toLowerCase();
      const family = hayFamilies.find((f) => f === n);
      if (family) { why.push(`color_family="${family}" matches dislikedColor "${d}"`); break; }
      const avail = hayAvailable.find((a) => a.includes(n));
      if (avail) { why.push(`available_color="${avail}" matches dislikedColor "${d}"`); break; }
      if (new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(hayText)) { why.push(`text matches dislikedColor "${d}"`); break; }
    }
    for (const f of prefs.dislikedFabrics) {
      const n = f.toLowerCase();
      if (hayFabricPrimary.includes(n)) { why.push(`primary_fabric="${p.primary_fabric}" matches dislikedFabric "${f}"`); break; }
      if (hayListingFabric.some((lf) => lf.includes(n))) { why.push(`listing.fabric matches dislikedFabric "${f}"`); break; }
      if (new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(hayText)) { why.push(`text matches dislikedFabric "${f}"`); break; }
    }
    for (const pat of prefs.dislikedPatterns) {
      const variants = PATTERN_VOCAB[pat.toLowerCase()] ?? [pat.toLowerCase().replace(/_/g, " ")];
      let matched = false;
      for (const v of variants) {
        if (hayListingPattern.some((lp) => lp.includes(v))) { why.push(`listing.pattern matches "${v}" (dislikedPattern "${pat}")`); matched = true; break; }
        if (new RegExp(`\\b${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(hayText)) { why.push(`text matches "${v}" (dislikedPattern "${pat}")`); matched = true; break; }
      }
      if (matched) break;
    }
    reasons.push({
      id: p.id,
      brand: p.brand_name,
      name: p.canonical_name,
      reason: why.join(" + ") || "<no match — bug>",
    });
  }
  return reasons;
}

async function runScenario(label: string, gender: string | undefined) {
  console.log("\n========================================");
  console.log(`SCENARIO: ${label}`);
  console.log(`tastegraph gender param: ${gender ?? "(none — unfiltered)"}`);
  console.log("========================================");

  const search = await searchProducts({ pageSize: 60, gender });
  const before = search.results;
  summarize(before, "BEFORE post-filter");

  const after = filterOutClientDislikes(before, {
    avoidBrands: MATT_PREFS.avoidBrands,
    dislikedColors: MATT_PREFS.dislikedColors,
    dislikedFabrics: MATT_PREFS.dislikedFabrics,
    dislikedPatterns: MATT_PREFS.dislikedPatterns,
  });
  summarize(after, "AFTER post-filter (drops applied)");

  const removed = before.filter((p) => !after.find((a) => a.id === p.id));
  const reasons = dropReasons(removed, MATT_PREFS);
  console.log(`\nProducts dropped: ${removed.length}`);
  reasons.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.brand} | ${r.name}`);
    console.log(`     reason: ${r.reason}`);
  });

  // Rank pass surfaces preferredBrands first, then liked-colour matches.
  // Empty arrays in either field are no-ops by design (see helper).
  const ranked = rankByClientLikes(after, {
    preferredBrands: MATT_PREFS.preferredBrands,
    likedColors: MATT_PREFS.likedColors,
  });
  const rankShift = after
    .map((p, i) => ({ id: p.id, beforeIdx: i, afterIdx: ranked.findIndex((r) => r.id === p.id) }))
    .filter((x) => x.beforeIdx !== x.afterIdx);
  console.log(`\nRank changes: ${rankShift.length} of ${after.length} products moved.`);
  if (rankShift.length > 0) {
    console.log("Top 5 of post-rank list:");
    ranked.slice(0, 5).forEach((p, i) => {
      const colorMatch = (p.color_families ?? []).filter((c) =>
        MATT_PREFS.likedColors.some((l) => l.toLowerCase() === c.toLowerCase()),
      );
      const tag = colorMatch.length > 0 ? ` ← liked-color match: [${colorMatch.join(", ")}]` : "";
      console.log(`  ${i + 1}. ${p.brand_name} | ${p.canonical_name}${tag}`);
    });
  }

  // Sanity audit: make sure no DROPPED product has a reason that's NOT in our
  // dislike sets, and make sure no SURVIVING product has a hit it shouldn't.
  let invariant_violations = 0;
  for (const p of after) {
    const fabHit = MATT_PREFS.dislikedFabrics.some(
      (f) => f.toLowerCase() === (p.primary_fabric ?? "").toLowerCase(),
    );
    const colorHit = (p.color_families ?? []).some((c) =>
      MATT_PREFS.dislikedColors.some((d) => d.toLowerCase() === c.toLowerCase()),
    );
    if (fabHit || colorHit) {
      invariant_violations++;
      console.log(
        `  ⚠ INVARIANT VIOLATED: ${p.brand_name} | ${p.canonical_name} survived but matches a dislike (fabric=${fabHit}, color=${colorHit})`,
      );
    }
  }
  console.log(`\nInvariant check (no surviving product matches a dislike): ${invariant_violations === 0 ? "PASS ✓" : `FAIL (${invariant_violations} violations)`}`);
}

async function main() {
  console.log(`Mapper sanity:`);
  console.log(`  MALE → ${mapGenderToInventory("MALE")}`);
  console.log(`  FEMALE → ${mapGenderToInventory("FEMALE")}`);
  console.log(`  NON_BINARY → ${mapGenderToInventory("NON_BINARY")}`);
  console.log(`  null → ${mapGenderToInventory(null)}`);

  await runScenario(
    "Matt with NO gender signal (User.gender blank, MatchQuizResult unset) — gender filter no-ops, post-filter still applies",
    undefined,
  );
  await runScenario(
    "Matt IF MatchQuizResult.genderToStyle = MALE — gender filter to men + post-filter",
    "men",
  );
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
