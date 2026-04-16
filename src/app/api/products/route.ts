import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server-auth";
import { searchProducts } from "@/lib/inventory/inventory-client";
import type { SearchQueryDto } from "@/lib/inventory/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/products — proxy to the tastegraph inventory search.
 * Query params map onto SearchQueryDto; pass-through to the service.
 * POST body variant allowed for richer filters (arrays + numbers).
 */
export async function GET(req: Request) {
  const { userId } = await getServerAuth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dto: SearchQueryDto = {
    query: url.searchParams.get("q") ?? url.searchParams.get("query") ?? undefined,
    gender: url.searchParams.get("gender") ?? undefined,
    categoryId: url.searchParams.get("categoryId") ?? undefined,
    brandId: url.searchParams.get("brandId") ?? undefined,
    minPrice: toInt(url.searchParams.get("minPrice")),
    maxPrice: toInt(url.searchParams.get("maxPrice")),
    inStockOnly: url.searchParams.get("inStockOnly") === "true" ? true : undefined,
    page: toInt(url.searchParams.get("page")),
    pageSize: toInt(url.searchParams.get("pageSize")),
    mode: (url.searchParams.get("mode") ?? undefined) as SearchQueryDto["mode"],
  };

  const result = await searchProducts(dto);
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const { userId } = await getServerAuth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as SearchQueryDto;
  const result = await searchProducts(body);
  return NextResponse.json(result);
}

function toInt(val: string | null): number | undefined {
  if (val == null) return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}
