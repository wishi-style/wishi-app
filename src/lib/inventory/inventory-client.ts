import type {
  SearchQueryDto,
  SearchResponse,
  ProductSearchDoc,
  FilterValuesResponse,
  ListingsLookupResponse,
  CommissionEvent,
  CommissionsResponse,
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

const EMPTY_FILTERS: FilterValuesResponse = {
  brands: [],
  categories: [],
  colors: [],
  sizes: [],
  primaryFabrics: [],
  merchants: [],
  genders: [],
};

/**
 * Fetch the set of valid filter values the UI should render (brands,
 * categories, colors, sizes). Mirrors GET /search/filters/values.
 * Returns an empty shape on failure so facet dropdowns render empty.
 */
export async function getFilters(): Promise<FilterValuesResponse> {
  const base = getBaseUrl();
  if (!base) return EMPTY_FILTERS;

  const cacheKey = "filters:values";
  const hit = cacheGet<FilterValuesResponse>(cacheKey);
  if (hit) return hit;

  try {
    const res = await fetch(`${base}/search/filters/values`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return EMPTY_FILTERS;
    const json = (await res.json()) as FilterValuesResponse;
    cacheSet(cacheKey, json);
    return json;
  } catch (err) {
    console.warn("[inventory] getFilters failed:", err);
    return EMPTY_FILTERS;
  }
}

/**
 * Batch-resolve listing metadata by id. Used when a stored `inventoryListingId`
 * needs to be hydrated to title/image/merchant for order-item snapshots.
 * Returns an empty object on failure — callers fall back to product lookup.
 */
export async function lookupListings(
  ids: string[],
): Promise<ListingsLookupResponse> {
  const base = getBaseUrl();
  if (!base || ids.length === 0) return {};

  const trimmed = ids.slice(0, 200);
  const cacheKey = `listings:${trimmed.slice().sort().join(",")}`;
  const hit = cacheGet<ListingsLookupResponse>(cacheKey);
  if (hit) return hit;

  try {
    const res = await fetch(`${base}/internal/listings/lookup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: trimmed }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return {};
    const json = (await res.json()) as ListingsLookupResponse;
    cacheSet(cacheKey, json);
    return json;
  } catch (err) {
    console.warn("[inventory] lookupListings failed:", err);
    return {};
  }
}

/**
 * Fetch commission events ingested after `since`. Paginated via cursor —
 * caller iterates until `cursor` is null. No caching (each poll must see
 * fresh data). Returns an empty page on failure; the worker retries next run.
 */
export async function getCommissions(
  since?: Date,
  limit = 1000,
): Promise<CommissionsResponse> {
  const base = getBaseUrl();
  if (!base) return { data: [], cursor: null };

  const params = new URLSearchParams();
  if (since) params.set("since_ingested", since.toISOString());
  params.set("limit", String(Math.min(limit, 1000)));

  try {
    const res = await fetch(`${base}/internal/commissions?${params.toString()}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return { data: [], cursor: null };
    return (await res.json()) as CommissionsResponse;
  } catch (err) {
    console.warn("[inventory] getCommissions failed:", err);
    return { data: [], cursor: null };
  }
}

/**
 * Iterate the commission feed across pages. Yields batches until cursor exhausts.
 * Used by the affiliate-ingest worker to process a full day of events.
 */
export async function* iterateCommissions(
  since?: Date,
): AsyncGenerator<CommissionEvent[]> {
  let nextSince = since;
  for (;;) {
    const page = await getCommissions(nextSince);
    if (page.data.length === 0) return;
    yield page.data;
    if (!page.cursor) return;
    const last = page.data[page.data.length - 1];
    nextSince = new Date(last.ingested_at);
  }
}

export function clearInventoryCache(): void {
  cache.clear();
}
