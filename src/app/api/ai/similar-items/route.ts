import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { searchProducts, getProduct } from "@/lib/inventory/inventory-client";

export const dynamic = "force-dynamic";

/**
 * PHASE 10 STUB — real vector / pgvector HNSW similarity lands in Phase 7.
 *
 * Falls back to a category + gender search against the tastegraph inventory
 * service so the ProductDetailDialog's "Similar Items" carousel still renders
 * useful suggestions. The Phase 7 implementation will proxy the inventory
 * service's `/similar/:id` semantic endpoint and return real top-k matches.
 *
 * Accepts `?productId=<inventoryProductId>` or `?categoryId=&gender=` to let
 * consumers pre-constrain when they already know the category.
 */
export async function GET(request: Request) {
  await requireAuth();
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  let categoryId = url.searchParams.get("categoryId");
  let gender = url.searchParams.get("gender");
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? 12), 1),
    24,
  );

  if (productId && (!categoryId || !gender)) {
    const source = await getProduct(productId);
    if (source) {
      categoryId = categoryId ?? source.category_id ?? null;
      gender = gender ?? source.gender ?? null;
    }
  }

  if (!categoryId) {
    return NextResponse.json({
      results: [],
      source: "stub" as const,
      reason: "no_category",
    });
  }

  const search = await searchProducts({
    categoryId,
    gender: gender ?? undefined,
    inStockOnly: true,
    lightweight: true,
    pageSize: limit,
  });

  const filtered = productId
    ? search.results.filter((r) => r.id !== productId)
    : search.results;

  return NextResponse.json({
    results: filtered.slice(0, limit),
    source: "stub" as const,
    reason: null,
  });
}
