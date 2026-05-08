import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { searchProducts } from "@/lib/inventory/inventory-client";
import {
  filterOutClientDislikes,
  mapGenderToInventory,
  rankByClientLikes,
} from "@/lib/inventory/client-prefilter";
import type { ProductSearchDoc } from "@/lib/inventory/types";

export const dynamic = "force-dynamic";

function bucketProducts(products: ProductSearchDoc[]) {
  const genders: Record<string, number> = {};
  const slugs: Record<string, number> = {};
  for (const p of products) {
    const g = p.gender || "<null>";
    genders[g] = (genders[g] ?? 0) + 1;
    const s = p.category_slug || "<null>";
    slugs[s] = (slugs[s] ?? 0) + 1;
  }
  return {
    count: products.length,
    genders,
    top_slugs: Object.fromEntries(
      Object.entries(slugs).sort((a, b) => b[1] - a[1]).slice(0, 10),
    ),
  };
}

/**
 * Admin-only diagnostic endpoint that runs the styleboard pre-filter pipeline
 * end-to-end against tastegraph for a given client. Mirrors the exact data
 * fetches and filter sequence used in
 * /(stylist)/stylist/sessions/[id]/styleboards/new/page.tsx so we can audit
 * "what would actually render for this client" without driving the UI.
 *
 * Usage: GET /api/admin/audit/prefilter?email=matthewcar@wishi.me
 *        (or ?clientId=<userId>)
 */
export async function GET(req: Request) {
  await requireAdmin();
  const url = new URL(req.url);
  const email = url.searchParams.get("email");
  const clientId = url.searchParams.get("clientId");
  if (!email && !clientId) {
    return NextResponse.json(
      { error: "Pass ?email= or ?clientId=" },
      { status: 400 },
    );
  }

  const client = await prisma.user.findFirst({
    where: clientId ? { id: clientId } : { email: email!.toLowerCase() },
    select: {
      id: true,
      email: true,
      gender: true,
      role: true,
      styleProfile: {
        select: {
          avoidBrands: true,
          preferredBrands: true,
          stylePreferences: true,
        },
      },
      bodyProfile: {
        select: { sizes: { select: { category: true, size: true } } },
      },
      matchQuizResults: {
        orderBy: { completedAt: "desc" },
        take: 1,
        select: {
          genderToStyle: true,
          styleDirection: true,
          completedAt: true,
        },
      },
      colorPreferences: { select: { color: true, isLiked: true } },
      fabricPreferences: { select: { fabric: true, isDisliked: true } },
      patternPreferences: { select: { pattern: true, isDisliked: true } },
      budgetByCategory: {
        select: { category: true, minInCents: true, maxInCents: true },
      },
    },
  });

  if (!client) {
    return NextResponse.json({ error: "client not found" }, { status: 404 });
  }

  const matchQuiz = client.matchQuizResults[0] ?? null;
  const effectiveGender =
    matchQuiz?.genderToStyle ?? client.gender ?? null;
  const inventoryGender = mapGenderToInventory(effectiveGender);

  const dislikedColors = client.colorPreferences
    .filter((c) => !c.isLiked)
    .map((c) => c.color);
  const likedColors = client.colorPreferences
    .filter((c) => c.isLiked)
    .map((c) => c.color);
  const dislikedFabrics = client.fabricPreferences
    .filter((f) => f.isDisliked)
    .map((f) => f.fabric);
  const dislikedPatterns = client.patternPreferences
    .filter((p) => p.isDisliked)
    .map((p) => p.pattern);
  const avoidBrands = client.styleProfile?.avoidBrands ?? [];
  const preferredBrands = client.styleProfile?.preferredBrands ?? [];

  const profile = {
    user_id: client.id,
    email: client.email,
    role: client.role,
    has_user_gender: client.gender !== null,
    user_gender: client.gender,
    has_match_quiz: matchQuiz !== null,
    match_quiz_gender_to_style: matchQuiz?.genderToStyle ?? null,
    match_quiz_style_direction: matchQuiz?.styleDirection ?? [],
    effective_gender_resolved: effectiveGender,
    inventory_gender_param_sent: inventoryGender ?? null,
    avoid_brands: avoidBrands,
    preferred_brands: preferredBrands,
    style_preferences: client.styleProfile?.stylePreferences ?? [],
    liked_colors: likedColors,
    disliked_colors: dislikedColors,
    disliked_fabrics: dislikedFabrics,
    disliked_patterns_NOT_FILTERED_BY_PR: dislikedPatterns,
    body_size_count: client.bodyProfile?.sizes.length ?? 0,
    budgets: client.budgetByCategory.map((b) => ({
      category: b.category,
      min_dollars: Math.round(b.minInCents / 100),
      max_dollars: Math.round(b.maxInCents / 100),
    })),
  };

  const [unfiltered, genderFiltered] = await Promise.all([
    searchProducts({ pageSize: 60 }),
    searchProducts({ pageSize: 60, gender: inventoryGender }),
  ]);

  const afterDislikes = filterOutClientDislikes(genderFiltered.results, {
    avoidBrands,
    dislikedColors,
    dislikedFabrics,
    dislikedPatterns,
  });
  const finalForClient = rankByClientLikes(afterDislikes, {
    preferredBrands,
    likedColors,
  });

  const droppedByDislikes =
    genderFiltered.results.length - afterDislikes.length;

  return NextResponse.json({
    profile,
    pipeline: {
      unfiltered: bucketProducts(unfiltered.results),
      after_gender_filter: bucketProducts(genderFiltered.results),
      after_post_filter_and_rank: bucketProducts(finalForClient),
      products_dropped_by_post_filter: droppedByDislikes,
      first_10_after_pipeline: finalForClient.slice(0, 10).map((p) => ({
        gender: p.gender,
        brand_name: p.brand_name,
        category_slug: p.category_slug,
        canonical_name: p.canonical_name,
        primary_fabric: p.primary_fabric,
        color_families: p.color_families,
      })),
    },
  });
}
