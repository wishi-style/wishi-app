import assert from "node:assert/strict";
import test from "node:test";
import type {
  FilterValuesResponse,
  ProductSearchDoc,
  SearchQueryDto,
  SuitPairRow,
} from "@/lib/inventory/types";

/**
 * Compile-time contract guards. These tests don't execute logic — they assert
 * that the `types.ts` shape matches the inventory-service contract by
 * destructuring expected fields off a fixture cast as the type. If the
 * service contract drifts (a field is renamed, removed, or its type changes),
 * TypeScript fails the build before this suite even runs.
 *
 * The fixture data is synthetic — it intentionally exercises every field so
 * unused fields can't silently disappear from the type.
 */

test("FilterValuesResponse: categories use name, not label; subColorsByFamily present", () => {
  const sample: FilterValuesResponse = {
    categories: [{ id: "c1", slug: "tops", name: "Tops" }],
    colors: [{ value: "red", count: 12 }],
    subColorsByFamily: { red: ["burgundy", "crimson"] },
    sizes: [{ value: "M", system: "us_alpha", count: 5 }],
    primaryFabrics: [{ value: "cotton", count: 9 }],
    brands: [{ id: "b1", name: "Acme" }],
    merchants: [{ id: "m1", name: "Shop" }],
    genders: ["women", "men", "unisex"],
  };
  assert.equal(sample.categories[0].name, "Tops");
  assert.deepEqual(sample.subColorsByFamily.red, ["burgundy", "crimson"]);
  assert.equal(sample.sizes[0].system, "us_alpha");
});

test("ProductSearchDoc: structured attributes (silhouette, construction, neckline) typed", () => {
  const doc: ProductSearchDoc = {
    id: "p1",
    canonical_name: "Slim blazer",
    canonical_description: null,
    brand_id: "b1",
    brand_name: "Acme",
    category_id: "c1",
    category_slug: "blazer",
    gender: "women",
    gtin: "",
    min_price: 200,
    max_price: 220,
    currency: "USD",
    in_stock: true,
    listing_count: 1,
    primary_image_url: null,
    image_urls: [],
    available_sizes: ["M"],
    available_colors: ["navy"],
    color_families: ["navy"],
    primary_fabric: "wool",
    fabric_tier: "premium",
    contains_leather: false,
    silhouette: "tailored",
    construction: "single-breasted",
    neckline: "notched-lapel",
    _score: 0.82,
    merchant_count: 3,
    updated_at: "",
    listings: [],
  };
  assert.equal(doc.silhouette, "tailored");
  assert.equal(doc._score, 0.82);
});

test("SearchQueryDto: all four modes accepted + power fields available", () => {
  const fts: SearchQueryDto = { mode: "fts", query: "blazer" };
  const sem: SearchQueryDto = { mode: "semantic", semanticQuery: "blazer" };
  const vec: SearchQueryDto = { mode: "vector", queryVector: [0.1, 0.2] };
  const dir: SearchQueryDto = { mode: "direction", queryVector: [0.1, 0.2] };
  const fullFilters: SearchQueryDto = {
    brandIds: ["b1"],
    merchantIds: ["m1"],
    colors: ["red"],
    sizes: ["M"],
    primaryFabrics: ["cotton"],
    excludeLeather: true,
    inStockOnly: true,
    minPrice: 50,
    maxPrice: 200,
    gender: "women",
    page: 1,
    pageSize: 60,
    lightweight: true,
  };
  assert.equal(fts.mode, "fts");
  assert.equal(sem.mode, "semantic");
  assert.equal(vec.mode, "vector");
  assert.equal(dir.mode, "direction");
  assert.equal(fullFilters.excludeLeather, true);
});

test("SuitPairRow: includes all expected fields", () => {
  const row: SuitPairRow = {
    blazer_product_id: "b1",
    pants_product_id: "p1",
    brand_name: "Acme",
    blazer_name: "Slim blazer",
    pants_name: "Slim trouser",
    color_raw: "navy",
    color_family: "navy",
    match_score: 0.91,
    blazer_min_price: 200,
    pants_min_price: 150,
    blazer_image_url: null,
    pants_image_url: null,
    semantic_distance: null,
  };
  assert.equal(row.color_family, "navy");
  assert.equal(row.semantic_distance, null);
});
