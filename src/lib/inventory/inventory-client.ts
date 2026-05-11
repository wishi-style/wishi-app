import type {
  SearchQueryDto,
  SearchResponse,
  ProductSearchDoc,
  FilterValuesResponse,
  FilterSchemaResponse,
  ListingsLookupResponse,
  CommissionEvent,
  CommissionsResponse,
  SearchBatchResponse,
  CandidateSearchResponse,
  EmbeddingsResponse,
  DirectionEmbeddingsResponse,
  SuitPairQueryDto,
  SuitPairRow,
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
  subColorsByFamily: {},
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
 * Fetch commission events ingested after `since`. The inventory service
 * returns an opaque `cursor` token that must be passed back on subsequent
 * calls to continue paging — `since_ingested` is only used for the first
 * page. No caching (each poll must see fresh data). Returns an empty page
 * on failure; the worker retries next run.
 */
export async function getCommissions(
  opts: { since?: Date; cursor?: string; limit?: number } = {},
): Promise<CommissionsResponse> {
  const base = getBaseUrl();
  if (!base) return { data: [], cursor: null };

  const { since, cursor, limit = 1000 } = opts;
  const params = new URLSearchParams();
  if (cursor) {
    params.set("cursor", cursor);
  } else if (since) {
    params.set("since_ingested", since.toISOString());
  }
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
 * Iterate the commission feed across pages, forwarding the server's cursor
 * token each call. Stops when the server returns a null cursor OR an empty
 * page. Used by the affiliate-ingest worker to process a full day of events.
 */
export async function* iterateCommissions(
  since?: Date,
): AsyncGenerator<CommissionEvent[]> {
  let cursor: string | undefined;
  let firstCall = true;
  for (;;) {
    const page = await getCommissions({
      since: firstCall ? since : undefined,
      cursor,
    });
    firstCall = false;
    if (page.data.length > 0) yield page.data;
    if (!page.cursor) return;
    cursor = page.cursor;
  }
}

// --------------------------------------------------------------------------
// Phase 11 / Phase 7 capability wrappers (batch, candidates, embeddings,
// suit-pairs, filter schema) — the stylist Shop workspace uses these for
// semantic / direction / composition flows. Same fail-soft pattern as above:
// empty/null results on network failure so the UI can render an empty state.
// --------------------------------------------------------------------------

const EMPTY_BATCH: SearchBatchResponse = { results: [] };
const EMPTY_CANDIDATES: CandidateSearchResponse = { total: 0, results: [] };
const EMPTY_EMBEDDINGS: EmbeddingsResponse = { embeddings: {} };
const EMPTY_DIRECTION: DirectionEmbeddingsResponse = { embeddings: {} };
const EMPTY_FILTER_SCHEMA: FilterSchemaResponse = { filters: [], modes: [] };

/**
 * Run multiple search queries in one round-trip. The service batches the
 * embedding step so semantic queries amortise the model call. Caps at 20
 * queries per request (service-side limit).
 */
export async function searchBatch(
  queries: SearchQueryDto[],
): Promise<SearchBatchResponse> {
  const base = getBaseUrl();
  if (!base || queries.length === 0) return EMPTY_BATCH;

  const trimmed = queries.slice(0, 20);
  const cacheKey = `batch:${JSON.stringify(trimmed)}`;
  const hit = cacheGet<SearchBatchResponse>(cacheKey);
  if (hit) return hit;

  try {
    const res = await fetch(`${base}/search/batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ queries: trimmed }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return EMPTY_BATCH;
    const json = (await res.json()) as SearchBatchResponse;
    cacheSet(cacheKey, json);
    return json;
  } catch (err) {
    console.warn("[inventory] searchBatch failed:", err);
    return EMPTY_BATCH;
  }
}

/**
 * Lightweight candidate search — no variants/listings hydrated. Returns one
 * row per matched listing (not deduped to product level on every path).
 * Useful for ML scoring pipelines and downstream rerankers.
 */
export async function searchCandidates(
  dto: SearchQueryDto,
): Promise<CandidateSearchResponse> {
  const base = getBaseUrl();
  if (!base) return EMPTY_CANDIDATES;

  const cacheKey = `candidates:${JSON.stringify(dto)}`;
  const hit = cacheGet<CandidateSearchResponse>(cacheKey);
  if (hit) return hit;

  try {
    const res = await fetch(`${base}/search/candidates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(dto),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return EMPTY_CANDIDATES;
    const json = (await res.json()) as CandidateSearchResponse;
    cacheSet(cacheKey, json);
    return json;
  } catch (err) {
    console.warn("[inventory] searchCandidates failed:", err);
    return EMPTY_CANDIDATES;
  }
}

/**
 * Fetch 1024-dim semantic embeddings for one or more listings. Used to seed
 * `mode: "vector"` follow-up queries ("find similar to this product").
 * Caches because the embeddings rarely change.
 */
export async function getEmbeddings(
  listingIds: string[],
): Promise<EmbeddingsResponse> {
  const base = getBaseUrl();
  if (!base || listingIds.length === 0) return EMPTY_EMBEDDINGS;

  const trimmed = listingIds.slice(0, 500);
  const cacheKey = `embeddings:${trimmed.slice().sort().join(",")}`;
  const hit = cacheGet<EmbeddingsResponse>(cacheKey);
  if (hit) return hit;

  try {
    const res = await fetch(`${base}/search/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listingIds: trimmed }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return EMPTY_EMBEDDINGS;
    const json = (await res.json()) as EmbeddingsResponse;
    cacheSet(cacheKey, json);
    return json;
  } catch (err) {
    console.warn("[inventory] getEmbeddings failed:", err);
    return EMPTY_EMBEDDINGS;
  }
}

/**
 * Fetch 768-dim FashionSigLIP direction embeddings — the moodboard-aware
 * vector space. Used by the LookCreator's "Looks like canvas" and
 * "Find pieces for this look" power modes. Uncached because the canvas
 * composition changes each call.
 */
export async function getDirectionEmbeddings(
  listingIds: string[],
): Promise<DirectionEmbeddingsResponse> {
  const base = getBaseUrl();
  if (!base || listingIds.length === 0) return EMPTY_DIRECTION;

  const trimmed = listingIds.slice(0, 500);

  try {
    const res = await fetch(`${base}/search/direction-embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listingIds: trimmed }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return EMPTY_DIRECTION;
    return (await res.json()) as DirectionEmbeddingsResponse;
  } catch (err) {
    console.warn("[inventory] getDirectionEmbeddings failed:", err);
    return EMPTY_DIRECTION;
  }
}

/**
 * Fetch pre-computed blazer + pants pairs by color family. Optional semantic
 * query refines the blazer choice. Returns an empty array on failure.
 */
export async function searchSuitPairs(
  dto: SuitPairQueryDto,
): Promise<SuitPairRow[]> {
  const base = getBaseUrl();
  if (!base) return [];

  const cacheKey = `suitpairs:${JSON.stringify(dto)}`;
  const hit = cacheGet<SuitPairRow[]>(cacheKey);
  if (hit) return hit;

  try {
    const res = await fetch(`${base}/search/suit-pairs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(dto),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as SuitPairRow[];
    cacheSet(cacheKey, json);
    return json;
  } catch (err) {
    console.warn("[inventory] searchSuitPairs failed:", err);
    return [];
  }
}

/**
 * Fetch the machine-readable filter contract. Long-lived (1h cache); the
 * shape only changes when the service deploys a new filter field.
 */
export async function getFilterSchema(): Promise<FilterSchemaResponse> {
  const base = getBaseUrl();
  if (!base) return EMPTY_FILTER_SCHEMA;

  const cacheKey = "filterschema";
  const hit = cacheGet<FilterSchemaResponse>(cacheKey);
  if (hit) return hit;

  try {
    const res = await fetch(`${base}/search/filters/schema`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return EMPTY_FILTER_SCHEMA;
    const json = (await res.json()) as FilterSchemaResponse;
    cacheSet(cacheKey, json, 60 * 60 * 1000);
    return json;
  } catch (err) {
    console.warn("[inventory] getFilterSchema failed:", err);
    return EMPTY_FILTER_SCHEMA;
  }
}

export function clearInventoryCache(): void {
  cache.clear();
}
