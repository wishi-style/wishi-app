/**
 * Types mirrored from the tastegraph/ai-stylist-platform inventory service.
 * The service does not publish a shared SDK; keep these in sync manually.
 *
 * Source of truth lives at
 *   apps/inventory/src/search/dto/*.ts
 *   apps/inventory/src/search/search.service.ts (getFilterValues, getFilterSchema)
 * in the tastegraph monorepo (cloned locally at ~/tastegraph/ai-stylist-platform/).
 */

// --------------------------------------------------------------------------
// Search input
// --------------------------------------------------------------------------

export type SearchMode = "fts" | "semantic" | "vector" | "direction";

export interface SearchQueryDto {
  // Search text / mode
  query?: string;
  mode?: SearchMode;
  semanticQuery?: string;
  /**
   * Pre-computed query vector. 1024-dim for `vector` mode (semantic space) or
   * 768-dim for `direction` mode (FashionSigLIP moodboard space).
   */
  queryVector?: number[];

  // Brand / merchant / category
  brandId?: string; // legacy single-brand filter; prefer `brandIds`
  brandIds?: string[];
  merchantIds?: string[];
  categoryId?: string; // service expands to children automatically

  // Demographics / attributes
  gender?: string; // "women" | "men" | "unisex" (aliased server-side)
  sizes?: string[]; // service `available_sizes` array overlap
  colors?: string[]; // service `color_families` array overlap

  // Material / fabric
  primaryFabrics?: string[];
  excludeLeather?: boolean;

  // Price (FTS: strict containment; semantic/vector/direction: existential)
  minPrice?: number;
  maxPrice?: number;

  // Stock + perf
  inStockOnly?: boolean;
  lightweight?: boolean; // skip listings/variants hydration

  // Pagination
  page?: number; // 1-indexed
  pageSize?: number; // max 200
}

// --------------------------------------------------------------------------
// Listings / variants
// --------------------------------------------------------------------------

export interface ProductVariant {
  size: string;
  color: string;
  color_family: string;
  in_stock: boolean;
}

export interface ProductListing {
  listing_id: string;
  merchant_id: string;
  merchant_name: string;
  title: string;
  product_url: string;
  affiliate_url: string;
  primary_image_url: string;
  base_price: number;
  sale_price: number;
  commission_percent: number;
  shipping_price: number;
  free_shipping: boolean;
  shipping_service: string;
  is_active: boolean;
  in_stock: boolean;
  updated_at: string;
  material_raw: string;
  primary_fabric: string;
  fabric_tier: string;
  contains_leather: boolean;
  fabric_composition: string;
  pattern: string;
  variants: ProductVariant[];
}

// --------------------------------------------------------------------------
// Product document
// --------------------------------------------------------------------------

export interface ProductSearchDoc {
  id: string;
  canonical_name: string;
  canonical_description: string | null;
  brand_id: string;
  brand_name: string;
  category_id: string;
  category_slug: string;
  gender: string;
  gtin: string;
  min_price: number;
  max_price: number;
  currency: string;
  in_stock: boolean;
  listing_count: number;
  primary_image_url: string | null;
  image_urls: string[];
  available_sizes: string[];
  available_colors: string[];
  color_families: string[];
  primary_fabric: string | null;
  fabric_tier: string | null;
  contains_leather: boolean | null;
  /** Structured LLM-extracted attributes used by the semantic reranker. */
  silhouette?: string | null;
  construction?: string | null;
  neckline?: string | null;
  /** Relevance score from semantic/vector/direction modes (1 − cosine distance). */
  _score?: number;
  /** Present on summary docs (lightweight=true). */
  merchant_count?: number;
  updated_at: string;
  listings: ProductListing[];
}

export interface SearchResponse {
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  results: ProductSearchDoc[];
}

// --------------------------------------------------------------------------
// Candidate search (lightweight, no listings)
// --------------------------------------------------------------------------

export interface CandidateDoc {
  id: string;
  listing_id: string;
  canonical_name: string;
  brand_name: string;
  category_id: string;
  category_slug: string;
  min_price: number;
  primary_image_url: string | null;
  gender: string;
  primary_fabric: string | null;
  fabric_tier: string | null;
  contains_leather: boolean | null;
  affiliate_url: string | null;
  effective_price: number | null;
  /** Only present in vector / semantic / direction modes. */
  distance?: number;
}

export interface CandidateSearchResponse {
  total: number;
  results: CandidateDoc[];
}

// --------------------------------------------------------------------------
// Batch search
// --------------------------------------------------------------------------

export interface SearchBatchRequest {
  /** Max 20 queries per batch. */
  queries: SearchQueryDto[];
}

export interface SearchBatchResponse {
  results: Array<{ total: number; results: ProductSearchDoc[] }>;
}

// --------------------------------------------------------------------------
// Suit pairs
// --------------------------------------------------------------------------

export interface SuitPairQueryDto {
  /** Required: color family to anchor the pair (e.g. "navy", "burgundy"). */
  colorFamily: string;
  semanticQuery?: string;
  gender?: string;
  excludeLeather?: boolean;
  brandId?: string;
  minPrice?: number;
  maxPrice?: number;
  /** 1–50, default 10. */
  limit?: number;
}

export interface SuitPairRow {
  blazer_product_id: string;
  pants_product_id: string;
  brand_name: string;
  blazer_name: string;
  pants_name: string;
  color_raw: string;
  color_family: string;
  match_score: number;
  blazer_min_price: number;
  pants_min_price: number;
  blazer_image_url: string | null;
  pants_image_url: string | null;
  /** Only present when the request included `semanticQuery`. */
  semantic_distance: number | null;
}

// --------------------------------------------------------------------------
// Embeddings (semantic + direction)
// --------------------------------------------------------------------------

export interface EmbeddingsRequest {
  /** Max 500 listing IDs per call. */
  listingIds: string[];
}

export interface EmbeddingsResponse {
  /** 1024-dim cosine embedding per listing (OpenAI text-embedding-3-small). */
  embeddings: Record<string, number[]>;
}

export interface DirectionEmbeddingsResponse {
  /** 768-dim FashionSigLIP moodboard direction embedding per listing. */
  embeddings: Record<string, number[]>;
}

// --------------------------------------------------------------------------
// Filter values + schema
// --------------------------------------------------------------------------

export interface FilterValuesResponse {
  categories: Array<{ id: string; slug: string; name: string }>;
  colors: Array<{ value: string; count: number }>;
  /** Sub-colors keyed by color family (e.g. "red" → ["burgundy", "crimson"]). */
  subColorsByFamily: Record<string, string[]>;
  sizes: Array<{ value: string; system: string; count: number }>;
  primaryFabrics: Array<{ value: string; count: number }>;
  brands: Array<{ id: string; name: string }>;
  merchants: Array<{ id: string; name: string }>;
  /** ["women", "men", "unisex"]. */
  genders: string[];
}

export interface FilterSchemaResponse {
  filters: Array<{ field: string; type: string; description: string }>;
  modes: Array<{ value: SearchMode; description: string }>;
}

// --------------------------------------------------------------------------
// Listing lookup + commissions (unchanged from prior version)
// --------------------------------------------------------------------------

export interface ListingLookupRow {
  title: string;
  image_url: string;
  merchant_name: string;
  product_id: string;
}

export type ListingsLookupResponse = Record<string, ListingLookupRow>;

export interface CommissionEvent {
  listing_id: string;
  product_id: string;
  merchant_id: string;
  merchant_name: string;
  order_reference: string;
  click_id: string | null;
  user_id: string | null;
  amount_in_cents: number;
  commission_in_cents: number;
  currency: string;
  order_placed_at: string;
  ingested_at: string;
}

export interface CommissionsResponse {
  data: CommissionEvent[];
  cursor: string | null;
}
