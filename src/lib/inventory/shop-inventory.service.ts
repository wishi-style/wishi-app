import {
  getDirectionEmbeddings,
  getEmbeddings,
  getProduct,
  searchProducts,
  searchBatch,
} from "./inventory-client";
import type {
  ProductSearchDoc,
  SearchQueryDto,
  SearchResponse,
} from "./types";
import {
  filterOutClientDislikes,
  rankByClientLikes,
} from "./client-prefilter";
import { loadClientStylingContext } from "./client-context";
import {
  adaptProductDoc,
  type AdaptedInventoryItem,
  type CategoryBucket,
} from "./adapt-product-doc";
import {
  deriveSmartDefaults,
  type AppliedSmartDefault,
  type ShopInventoryFilters,
  type SmartDefaultKind,
} from "./shop-inventory.defaults";

export type {
  AppliedSmartDefault,
  ShopInventoryFilters,
  SmartDefaultKind,
} from "./shop-inventory.defaults";

/**
 * Single orchestration entry point for the LookCreator Shop workspace.
 * Used by:
 *   - The SSR page for first paint.
 *   - The `/api/stylist/sessions/[id]/shop-inventory` POST route for every
 *     filter / paginate / power-mode invocation thereafter.
 *
 * Pipeline:
 *   1. Resolve client styling context (preferences, sizes, budgets, gender).
 *   2. Apply smart defaults on top of the stylist's explicit filters.
 *   3. Route to the right search mode:
 *        - similarToProductId   → "vector"    (1024-dim semantic embedding)
 *        - directionFromCanvas  → "direction" (768-dim FashionSigLIP avg)
 *        - explicit `keyword`   → "fts"
 *        - default with query   → "semantic"
 *        - empty query          → no mode (browse)
 *   4. Run the search; map service-side `colors` and `sizes` straight through.
 *   5. Apply client-side post-filters that the service can't enforce:
 *        - Dislike filtering (brands / colors / fabrics / patterns).
 *        - Fabric tier (luxury / premium / standard / synthetic).
 *        - Sub-color (specific color_normalized values).
 *   6. Rank by client likes (preferred brands first, liked colors second).
 *   7. Adapt to the chrome's InventoryItem shape.
 *   8. Apply the stylist's sort preference over the loaded page.
 */
export interface ShopInventoryRequest extends ShopInventoryFilters {
  sessionId: string;
  /** Active chrome category bucket; drives size + budget smart defaults. */
  category?: CategoryBucket;

  /** Set of smart defaults the stylist has dismissed for this session.
   *  Sent up from the browser; persisted in sessionStorage there. */
  dismissedDefaults?: SmartDefaultKind[];

  page?: number;
  pageSize?: number;

  /** "Find similar to product X" — vector-mode shortcut. The service
   *  fetches the product's first listing embedding and queries the catalog
   *  for nearest neighbours. */
  similarToProductId?: string;

  /** "Looks like canvas" — direction-mode shortcut. The service fetches
   *  direction embeddings for the canvas listing ids, averages them, and
   *  queries on the resulting 768-dim moodboard vector. */
  directionFromListingIds?: string[];
}

export interface ShopInventoryResponse {
  items: AdaptedInventoryItem[];
  total: number;
  /** total adjusted for the dislike-loss rate observed on this page. Shown to
   *  the stylist as "≈ N items" to avoid promising a precise post-dislike
   *  count without paying for it. */
  visibleApprox: number;
  page: number;
  pageSize: number;
  pages: number;
  appliedSmartDefaults: AppliedSmartDefault[];
  /** Power-mode metadata so the UI can render a "Looking like canvas" chip. */
  powerMode?: {
    kind: "similar" | "direction";
    label: string;
  };
}

const EMPTY_RESPONSE = (page: number, pageSize: number): ShopInventoryResponse => ({
  items: [],
  total: 0,
  visibleApprox: 0,
  page,
  pageSize,
  pages: 0,
  appliedSmartDefaults: [],
});

/**
 * Average a set of equal-length vectors. Returns null when the input is
 * empty or vectors disagree on dimensionality (defensive — embeddings
 * service may swap models without a redeploy).
 */
function averageVector(vectors: number[][]): number[] | null {
  if (vectors.length === 0) return null;
  const dim = vectors[0].length;
  if (vectors.some((v) => v.length !== dim)) return null;
  const sum = new Array<number>(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) sum[i] += v[i];
  }
  return sum.map((s) => s / vectors.length);
}

/**
 * Build the merchant-id list from a stylist filter object. We accept either
 * an array of ids or a single id (the chrome's older single-merchant code
 * path) and normalise to an array.
 */
function nonEmptyArr(arr: string[] | undefined): string[] | undefined {
  if (!arr || arr.length === 0) return undefined;
  return arr;
}

/**
 * Map the chrome's filter object to a tastegraph SearchQueryDto. Only the
 * fields the service accepts make it through; client-side-only fields
 * (fabricTiers, subColors, sort) stay in the orchestration layer and are
 * applied post-fetch.
 */
function buildSearchDto(
  filters: ShopInventoryFilters,
  page: number,
  pageSize: number,
): SearchQueryDto {
  return {
    merchantIds: nonEmptyArr(filters.merchantIds),
    brandIds: nonEmptyArr(filters.brandIds),
    categoryId: filters.categoryId || undefined,
    colors: nonEmptyArr(filters.colors),
    sizes: nonEmptyArr(filters.sizes),
    primaryFabrics: nonEmptyArr(filters.primaryFabrics),
    excludeLeather: filters.excludeLeather === true ? true : undefined,
    inStockOnly: filters.inStockOnly === true ? true : undefined,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    gender: filters.gender,
    page,
    pageSize,
  };
}

/**
 * Decide which search mode the request maps to, and set the relevant fields.
 * Mutates `dto` in place for compactness; returns optional power-mode metadata
 * so the UI can render an "in this mode" chip.
 */
async function applySearchMode(
  dto: SearchQueryDto,
  req: ShopInventoryRequest,
  filters: ShopInventoryFilters,
): Promise<ShopInventoryResponse["powerMode"] | undefined> {
  // similar-to-product trumps direction (most specific intent wins)
  if (req.similarToProductId) {
    const product = await getProduct(req.similarToProductId);
    const listingId = product?.listings?.[0]?.listing_id;
    if (listingId) {
      const { embeddings } = await getEmbeddings([listingId]);
      const vec = embeddings[listingId];
      if (vec?.length) {
        dto.mode = "vector";
        dto.queryVector = vec;
        return {
          kind: "similar",
          label: `Similar to ${product?.brand_name ?? "product"} ${product?.canonical_name ?? ""}`.trim(),
        };
      }
    }
  }

  if (req.directionFromListingIds && req.directionFromListingIds.length > 0) {
    const { embeddings } = await getDirectionEmbeddings(
      req.directionFromListingIds,
    );
    const vectors = Object.values(embeddings).filter((v) => v?.length);
    const avg = averageVector(vectors);
    if (avg) {
      dto.mode = "direction";
      dto.queryVector = avg;
      return {
        kind: "direction",
        label: `Looks like canvas (${vectors.length} ${vectors.length === 1 ? "item" : "items"})`,
      };
    }
  }

  // Normal search modes
  const q = filters.query?.trim();
  if (q) {
    if (filters.mode === "keyword") {
      dto.mode = "fts";
      dto.query = q;
    } else {
      dto.mode = "semantic";
      dto.semanticQuery = q;
    }
  }
  return undefined;
}

function dislikeLossRate(
  pre: ProductSearchDoc[],
  post: ProductSearchDoc[],
): number {
  if (pre.length === 0) return 0;
  return Math.max(0, (pre.length - post.length) / pre.length);
}

function filterByFabricTier<T extends { fabricTier?: string }>(
  items: T[],
  tiers: string[] | undefined,
): T[] {
  if (!tiers || tiers.length === 0) return items;
  const allow = new Set(tiers.map((t) => t.toLowerCase()));
  return items.filter((it) => {
    if (!it.fabricTier) return false;
    return allow.has(it.fabricTier.toLowerCase());
  });
}

function filterBySubColors(
  items: AdaptedInventoryItem[],
  subColors: string[] | undefined,
  docs: ProductSearchDoc[],
): AdaptedInventoryItem[] {
  if (!subColors || subColors.length === 0) return items;
  const allow = new Set(subColors.map((s) => s.trim().toLowerCase()));
  const docById = new Map(docs.map((d) => [d.id, d]));
  return items.filter((it) => {
    const doc = docById.get(it.id);
    if (!doc) return false;
    const present = (doc.available_colors ?? []).map((c) =>
      c.trim().toLowerCase(),
    );
    return present.some((c) => allow.has(c));
  });
}

function applySort(
  items: AdaptedInventoryItem[],
  sort: ShopInventoryFilters["sort"],
): AdaptedInventoryItem[] {
  if (!sort || sort === "relevance" || sort === "newest") return items;
  // Stable sort over the loaded page. v1 trade-off; service doesn't yet
  // accept a `sort` field in the DTO. "newest" no-ops until the adapter
  // surfaces updated_at; "relevance" is the service's natural order.
  const indexed = items.map((it, i) => ({ it, i }));
  type Entry = { it: AdaptedInventoryItem; i: number };
  const cmp: Record<"price_asc" | "price_desc" | "in_stock_first", (a: Entry, b: Entry) => number> = {
    price_asc: (a, b) =>
      (a.it.priceValue ?? Infinity) - (b.it.priceValue ?? Infinity) || a.i - b.i,
    price_desc: (a, b) =>
      (b.it.priceValue ?? -Infinity) - (a.it.priceValue ?? -Infinity) ||
      a.i - b.i,
    in_stock_first: (a, b) => {
      const aStock = a.it.availability === "in-stock" ? 0 : 1;
      const bStock = b.it.availability === "in-stock" ? 0 : 1;
      return aStock - bStock || a.i - b.i;
    },
  };
  return indexed.sort(cmp[sort]).map((x) => x.it);
}

export async function loadShopInventory(
  req: ShopInventoryRequest,
): Promise<ShopInventoryResponse> {
  const page = Math.max(1, req.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, req.pageSize ?? 60));

  const ctx = await loadClientStylingContext({ sessionId: req.sessionId });
  if (!ctx) return EMPTY_RESPONSE(page, pageSize);

  // Pull the stylist-explicit filter shape out of the request envelope.
  const explicit: ShopInventoryFilters = {
    query: req.query,
    mode: req.mode,
    merchantIds: req.merchantIds,
    brandIds: req.brandIds,
    categoryId: req.categoryId,
    colors: req.colors,
    subColors: req.subColors,
    sizes: req.sizes,
    primaryFabrics: req.primaryFabrics,
    fabricTiers: req.fabricTiers,
    excludeLeather: req.excludeLeather,
    inStockOnly: req.inStockOnly,
    minPrice: req.minPrice,
    maxPrice: req.maxPrice,
    gender: req.gender,
    sort: req.sort,
  };

  const dismissed = new Set(req.dismissedDefaults ?? []);
  const category = req.category ?? "all";
  const { merged, applied } = deriveSmartDefaults(
    ctx,
    explicit,
    category,
    dismissed,
  );

  // Power-mode invocations skip the search-query construction and route
  // straight into vector / direction modes.
  const dto = buildSearchDto(merged, page, pageSize);
  const powerMode = await applySearchMode(dto, req, merged);

  const search: SearchResponse = await searchProducts(dto);

  const preDislike = search.results;
  const postDislike = filterOutClientDislikes(preDislike, {
    avoidBrands: ctx.avoidBrands,
    dislikedColors: ctx.dislikedColors,
    dislikedFabrics: ctx.dislikedFabrics,
    dislikedPatterns: ctx.dislikedPatterns,
  });
  const ranked = rankByClientLikes(postDislike, {
    preferredBrands: ctx.preferredBrands,
    likedColors: ctx.likedColors,
  });

  let items = ranked.map(adaptProductDoc);
  items = filterByFabricTier(items, merged.fabricTiers);
  items = filterBySubColors(items, merged.subColors, ranked);
  items = applySort(items, merged.sort);

  const lossRate = dislikeLossRate(preDislike, postDislike);
  const visibleApprox = Math.max(
    items.length,
    Math.round(search.total * (1 - lossRate)),
  );

  return {
    items,
    total: search.total,
    visibleApprox,
    page: search.page,
    pageSize: search.pageSize,
    pages: search.pages,
    appliedSmartDefaults: applied,
    powerMode,
  };
}

// --------------------------------------------------------------------------
// "Find pieces for this look" — batch search for missing canvas categories
// --------------------------------------------------------------------------

/**
 * Given the set of canvas items' category buckets, return the buckets the
 * stylist hasn't filled yet (out of: tops, bottoms, outerwear, shoes,
 * accessories).
 */
export function missingCanvasBuckets(
  filled: ReadonlyArray<Exclude<CategoryBucket, "all">>,
): Exclude<CategoryBucket, "all">[] {
  const present = new Set(filled);
  const required: Exclude<CategoryBucket, "all">[] = [
    "tops",
    "bottoms",
    "outerwear",
    "shoes",
    "accessories",
  ];
  return required.filter((b) => !present.has(b));
}

export interface LookPiecesBucket {
  bucket: Exclude<CategoryBucket, "all">;
  items: AdaptedInventoryItem[];
}

export interface LookPiecesResponse {
  buckets: LookPiecesBucket[];
}

/**
 * Fire one direction-mode query per missing bucket, in parallel via
 * /search/batch (one embedding evaluation total). Each sub-query carries
 * the averaged canvas direction vector + a category hint derived from the
 * service's category-slug regexes (we can't push a single categoryId
 * because the chrome bucket maps to many service categories).
 *
 * v1 implementation: instead of categoryId (singular), use a coarse
 * post-filter on `bucketCategory(category_slug)` after the batch. This is
 * cheap because /search/batch already deduped to product level.
 */
export async function loadLookPieces(opts: {
  sessionId: string;
  canvasListingIds: string[];
  filledBuckets: ReadonlyArray<Exclude<CategoryBucket, "all">>;
  perBucket?: number;
}): Promise<LookPiecesResponse> {
  const ctx = await loadClientStylingContext({ sessionId: opts.sessionId });
  if (!ctx || opts.canvasListingIds.length === 0) {
    return { buckets: [] };
  }
  const missing = missingCanvasBuckets(opts.filledBuckets);
  if (missing.length === 0) return { buckets: [] };

  // 1× direction-embedding fetch for the canvas
  const { embeddings } = await getDirectionEmbeddings(opts.canvasListingIds);
  const vectors = Object.values(embeddings).filter((v) => v?.length);
  const avg = averageVector(vectors);
  if (!avg) return { buckets: [] };

  const perBucket = Math.min(24, Math.max(4, opts.perBucket ?? 8));

  // Pull a wider page per-bucket; we re-filter to that bucket client-side.
  const oversample = Math.min(60, perBucket * 5);

  const baseFilters: ShopInventoryFilters = {
    inStockOnly: true,
    gender: ctx.inventoryGender,
    excludeLeather: ctx.excludeLeatherByDefault || undefined,
  };

  const queries: SearchQueryDto[] = missing.map(() => ({
    ...buildSearchDto(baseFilters, 1, oversample),
    mode: "direction",
    queryVector: avg,
  }));

  const batch = await searchBatch(queries);

  const buckets: LookPiecesBucket[] = missing.map((bucket, i) => {
    const docs = batch.results[i]?.results ?? [];
    const filtered = filterOutClientDislikes(docs, {
      avoidBrands: ctx.avoidBrands,
      dislikedColors: ctx.dislikedColors,
      dislikedFabrics: ctx.dislikedFabrics,
      dislikedPatterns: ctx.dislikedPatterns,
    });
    const items = filtered
      .map(adaptProductDoc)
      .filter((it) => it.category === bucket)
      .slice(0, perBucket);
    return { bucket, items };
  });

  return { buckets };
}
