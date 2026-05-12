import type { ProductSearchDoc } from "./types";

/** Loveable's chrome category bucket — coarser than tastegraph's category tree. */
export type CategoryBucket =
  | "all"
  | "tops"
  | "bottoms"
  | "outerwear"
  | "accessories"
  | "shoes";

/**
 * Map tastegraph's free-text category_slug into the five chrome buckets that
 * the LookCreator UI groups by. Tastegraph has hundreds of slugs; this keeps
 * the chrome simple while we wait for the service to add a `bucket` field or
 * accept multi-id category filters.
 */
export function bucketCategory(
  slug: string | null | undefined,
): Exclude<CategoryBucket, "all"> {
  const s = (slug ?? "").toLowerCase();
  if (/coat|jacket|outerwear|sweater|knitwear|cardigan|blazer/.test(s))
    return "outerwear";
  if (/pant|jean|trouser|skirt|short|legging/.test(s)) return "bottoms";
  if (/shoe|boot|sandal|sneaker|loafer|heel|flat/.test(s)) return "shoes";
  if (/bag|belt|scarf|hat|jewelry|earring|necklace|bracelet|sunglass|wallet/.test(s))
    return "accessories";
  return "tops";
}

/**
 * Shape consumed by the LookCreator builder (`StyleboardBuilder`'s
 * `InventoryItem` type). Keep this aligned with the chrome — adding fields
 * here means widening the builder's type too.
 */
export interface AdaptedInventoryItem {
  id: string;
  /** Underlying tastegraph product id. Same as `id` for shop items; differs for
   *  cart items where `id` is the CartItem row id. */
  inventoryProductId?: string;
  /** Tastegraph listing id for the canonical listing we surfaced. Used by the
   *  "find similar" / "looks like canvas" power modes. */
  listingId?: string;
  image: string;
  brand: string;
  name: string;
  price?: string;
  /** Numeric form of the displayed price, in whole dollars. Used by the
   *  budget-flag pill without re-parsing the formatted string. */
  priceValue?: number;
  category: Exclude<CategoryBucket, "all">;
  /** Tastegraph's free-text slug, retained for the "find pieces" matcher. */
  categorySlug?: string;
  subcategory?: string;
  retailer?: string;
  retailerUrl?: string;
  availability?: "in-stock" | "preorder" | "sale" | "final-sale";
  colors?: string[];
  sizes?: string[];
  designer?: string;
  /** Tastegraph fabric_tier ("luxury" | "premium" | "standard" | "synthetic"),
   *  exposed so the card can show a subtle "Luxury" / "Premium" badge. */
  fabricTier?: string;
  /** Relevance score from semantic/vector/direction modes. */
  _score?: number;
  season?: "spring" | "summer" | "fall" | "winter";
}

export function adaptProductDoc(doc: ProductSearchDoc): AdaptedInventoryItem {
  const firstListing = doc.listings?.[0];
  return {
    id: doc.id,
    inventoryProductId: doc.id,
    listingId: firstListing?.listing_id,
    image: doc.primary_image_url ?? doc.image_urls?.[0] ?? "",
    brand: doc.brand_name,
    name: doc.canonical_name,
    price: `$${Math.round(doc.min_price)}`,
    priceValue: Math.round(doc.min_price),
    category: bucketCategory(doc.category_slug),
    categorySlug: doc.category_slug,
    colors: doc.color_families ?? [],
    sizes: doc.available_sizes ?? [],
    retailer: firstListing?.merchant_name,
    retailerUrl: firstListing?.product_url,
    availability: doc.in_stock ? "in-stock" : undefined,
    designer: doc.brand_name,
    fabricTier: doc.fabric_tier ?? undefined,
    _score: doc._score,
  };
}
