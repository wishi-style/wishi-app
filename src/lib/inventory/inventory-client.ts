import type {
  SearchQueryDto,
  SearchResponse,
  ProductSearchDoc,
} from "./types";

const CACHE_TTL_MS = 5 * 60 * 1000;
const EMPTY_RESULT: SearchResponse = {
  total: 0,
  page: 1,
  pageSize: 0,
  pages: 0,
  results: [],
};

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

function cacheSet<T>(key: string, value: T, ttlMs: number = CACHE_TTL_MS): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function getBaseUrl(): string | null {
  return process.env.INVENTORY_SERVICE_URL?.replace(/\/$/, "") ?? null;
}

/**
 * Search the tastegraph inventory service. Returns an empty result set on
 * network failure, timeout, or missing INVENTORY_SERVICE_URL — the consumer
 * (stylist board builder) should render an empty-state rather than 500.
 */
export async function searchProducts(
  dto: SearchQueryDto,
): Promise<SearchResponse> {
  const base = getBaseUrl();
  if (!base) return EMPTY_RESULT;

  const cacheKey = `search:${JSON.stringify(dto)}`;
  const hit = cacheGet<SearchResponse>(cacheKey);
  if (hit) return hit;

  try {
    const res = await fetch(`${base}/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(dto),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return EMPTY_RESULT;
    const json = (await res.json()) as SearchResponse;
    cacheSet(cacheKey, json);
    return json;
  } catch (err) {
    console.warn("[inventory] searchProducts failed:", err);
    return EMPTY_RESULT;
  }
}

/**
 * Fetch a single product (with listings) by id. Returns null on miss or failure.
 */
export async function getProduct(id: string): Promise<ProductSearchDoc | null> {
  const base = getBaseUrl();
  if (!base) return null;

  const cacheKey = `product:${id}`;
  const hit = cacheGet<ProductSearchDoc>(cacheKey);
  if (hit) return hit;

  try {
    const res = await fetch(`${base}/search/products/${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const json = (await res.json()) as ProductSearchDoc;
    cacheSet(cacheKey, json);
    return json;
  } catch (err) {
    console.warn(`[inventory] getProduct(${id}) failed:`, err);
    return null;
  }
}

export function clearInventoryCache(): void {
  cache.clear();
}
