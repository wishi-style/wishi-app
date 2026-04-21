/**
 * Types mirrored from the tastegraph/ai-stylist-platform inventory service.
 * The service does not publish a shared SDK; keep these in sync manually.
 */

export interface SearchQueryDto {
  query?: string;
  brandId?: string;
  merchantIds?: string[];
  brandIds?: string[];
  categoryId?: string;
  gender?: string;
  sizes?: string[];
  colors?: string[];
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  excludeLeather?: boolean;
  primaryFabrics?: string[];
  mode?: "fts" | "semantic" | "vector" | "direction";
  semanticQuery?: string;
  queryVector?: number[];
  page?: number;
  pageSize?: number;
  lightweight?: boolean;
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
  variants: Array<{
    size: string;
    color: string;
    color_family: string;
    in_stock: boolean;
  }>;
}

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

export interface FilterValuesResponse {
  brands: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; slug: string; label: string }>;
  colors: string[];
  sizes: string[];
  primaryFabrics: string[];
  merchants: Array<{ id: string; name: string }>;
  genders: string[];
}

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
