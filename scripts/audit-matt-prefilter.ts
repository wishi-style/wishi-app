/**
 * Read-only audit of a client account in staging Postgres.
 * Prints profile summary + filter pipeline dry-run only.
 * Requires DATABASE_URL pointing at staging (read-only).
 *
 * Usage: AUDIT_EMAIL=user@example.com npx tsx scripts/audit-matt-prefilter.ts
 *    or: npx tsx scripts/audit-matt-prefilter.ts user@example.com
 */
import { prisma } from "@/lib/prisma";
import { searchProducts } from "@/lib/inventory/inventory-client";
import {
  filterOutClientDislikes,
  mapGenderToInventory,
  rankByClientLikes,
} from "@/lib/inventory/client-prefilter";

async function main() {
  const email = process.argv[2] ?? process.env.AUDIT_EMAIL;
  if (!email) {
    console.error("Pass an email as the first arg or set AUDIT_EMAIL.");
    process.exit(1);
  }
  const matt = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: {
      id: true,
      gender: true,
      styleProfile: { select: { avoidBrands: true, preferredBrands: true } },
      bodyProfile: { select: { sizes: { select: { category: true, size: true } } } },
      matchQuizResults: { orderBy: { completedAt: "desc" }, take: 1, select: { genderToStyle: true } },
      colorPreferences: { select: { color: true, isLiked: true } },
      fabricPreferences: { select: { fabric: true, isDisliked: true } },
      patternPreferences: { select: { pattern: true, isDisliked: true } },
      budgetByCategory: { select: { category: true, minInCents: true, maxInCents: true } },
    },
  });
  if (!matt) {
    console.log("not_found");
    return;
  }

  const effectiveGender = matt.matchQuizResults[0]?.genderToStyle ?? matt.gender ?? null;
  const inventoryGender = mapGenderToInventory(effectiveGender);

  const dislikedColors = matt.colorPreferences.filter((c) => !c.isLiked).map((c) => c.color);
  const likedColors = matt.colorPreferences.filter((c) => c.isLiked).map((c) => c.color);
  const dislikedFabrics = matt.fabricPreferences.filter((f) => f.isDisliked).map((f) => f.fabric);
  const dislikedPatterns = matt.patternPreferences.filter((p) => p.isDisliked).map((p) => p.pattern);
  const avoidBrands = matt.styleProfile?.avoidBrands ?? [];
  const preferredBrands = matt.styleProfile?.preferredBrands ?? [];

  const summary = {
    has_user_gender: matt.gender !== null,
    user_gender: matt.gender,
    has_match_quiz: matt.matchQuizResults.length > 0,
    match_quiz_gender_to_style: matt.matchQuizResults[0]?.genderToStyle ?? null,
    effective_gender_resolved: effectiveGender,
    inventory_gender_param_sent: inventoryGender,
    avoid_brand_count: avoidBrands.length,
    preferred_brand_count: preferredBrands.length,
    disliked_color_count: dislikedColors.length,
    liked_color_count: likedColors.length,
    disliked_fabric_count: dislikedFabrics.length,
    disliked_pattern_count: dislikedPatterns.length,
    body_size_count: matt.bodyProfile?.sizes.length ?? 0,
    budget_categories_set: matt.budgetByCategory.length,
    disliked_colors: dislikedColors,
    liked_colors: likedColors,
    disliked_fabrics: dislikedFabrics,
    disliked_patterns: dislikedPatterns,
  };
  console.log("PROFILE_SUMMARY:", JSON.stringify(summary, null, 2));

  // Run the actual filter pipeline twice: once unfiltered, once with my PR's filter.
  const [unfiltered, filtered] = await Promise.all([
    searchProducts({ pageSize: 60 }),
    searchProducts({ pageSize: 60, gender: inventoryGender }),
  ]);

  function bucket(arr: { gender: string; category_slug: string; primary_fabric: string | null; color_families: string[]; brand_name: string }[]) {
    const genders: Record<string, number> = {};
    const slugs: Record<string, number> = {};
    arr.forEach((p) => {
      genders[p.gender || "<null>"] = (genders[p.gender || "<null>"] || 0) + 1;
      slugs[p.category_slug || "<null>"] = (slugs[p.category_slug || "<null>"] || 0) + 1;
    });
    return { count: arr.length, genders, top_slugs: Object.fromEntries(Object.entries(slugs).sort((a, b) => b[1] - a[1]).slice(0, 8)) };
  }

  const finalForMatt = rankByClientLikes(
    filterOutClientDislikes(filtered.results, { avoidBrands, dislikedColors, dislikedFabrics, dislikedPatterns }),
    { preferredBrands, likedColors },
  );
  const droppedByDislikes = filtered.results.length - finalForMatt.length;

  console.log("\nUNFILTERED (current production behavior for Matt's session):");
  console.log(JSON.stringify(bucket(unfiltered.results), null, 2));
  console.log("\nGENDER-FILTERED (after PR ships, before post-filter):");
  console.log(JSON.stringify(bucket(filtered.results), null, 2));
  console.log("\nFINAL after post-filter + rank (what Matt would actually see):");
  console.log(JSON.stringify(bucket(finalForMatt), null, 2));
  console.log("Products dropped by dislike post-filter:", droppedByDislikes);

  // Pattern-text audit: surface canonical_name / canonical_description hits
  // alongside the structured filter so we can spot weak product copy where
  // the synonym map might still leak (e.g. a "Buffalo Plaid" lurking under
  // an unparsed listings[].pattern field).
  const patternHits = filtered.results.filter((p) =>
    dislikedPatterns.some((pat) => {
      const word = pat.replace(/_/g, " ");
      return (p.canonical_name || "").toLowerCase().includes(word.toLowerCase()) ||
        (p.canonical_description || "").toLowerCase().includes(word.toLowerCase());
    }),
  );
  console.log(`\nPATTERN-TEXT MATCHES (dislikes my PR ignores): ${patternHits.length} of 60`);
  patternHits.slice(0, 5).forEach((p) => {
    console.log(`  [${p.gender}] ${p.brand_name} | ${p.category_slug} | ${p.canonical_name}`);
  });
}

main().finally(() => prisma.$disconnect());
