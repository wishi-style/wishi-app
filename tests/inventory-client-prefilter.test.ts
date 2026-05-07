import assert from "node:assert/strict";
import test from "node:test";
import {
  filterOutClientDislikes,
  mapGenderToInventory,
  rankByClientLikes,
} from "@/lib/inventory/client-prefilter";
import type { ProductSearchDoc } from "@/lib/inventory/types";

function makeProduct(overrides: Partial<ProductSearchDoc>): ProductSearchDoc {
  return {
    id: "p1",
    canonical_name: "Sample",
    canonical_description: null,
    brand_id: "b1",
    brand_name: "Acme",
    category_id: "c1",
    category_slug: "tops",
    gender: "men",
    gtin: "",
    min_price: 50,
    max_price: 50,
    currency: "USD",
    in_stock: true,
    listing_count: 1,
    primary_image_url: null,
    image_urls: [],
    available_sizes: [],
    available_colors: [],
    color_families: [],
    primary_fabric: null,
    fabric_tier: null,
    contains_leather: null,
    updated_at: "",
    listings: [],
    ...overrides,
  };
}

test("mapGenderToInventory: MALE -> men, FEMALE -> women", () => {
  assert.equal(mapGenderToInventory("MALE"), "men");
  assert.equal(mapGenderToInventory("FEMALE"), "women");
});

test("mapGenderToInventory: NON_BINARY / PREFER_NOT_TO_SAY / null -> undefined (unfiltered)", () => {
  assert.equal(mapGenderToInventory("NON_BINARY"), undefined);
  assert.equal(mapGenderToInventory("PREFER_NOT_TO_SAY"), undefined);
  assert.equal(mapGenderToInventory(null), undefined);
  assert.equal(mapGenderToInventory(undefined), undefined);
});

test("filterOutClientDislikes: drops products on avoid-brand list (case-insensitive)", () => {
  const products = [
    makeProduct({ id: "a", brand_name: "Lululemon" }),
    makeProduct({ id: "b", brand_name: "Patagonia" }),
    makeProduct({ id: "c", brand_name: "  lululemon  " }),
  ];
  const result = filterOutClientDislikes(products, {
    avoidBrands: ["LULULEMON"],
    dislikedColors: [],
    dislikedFabrics: [],
  });
  assert.deepEqual(
    result.map((p) => p.id),
    ["b"],
  );
});

test("filterOutClientDislikes: drops products whose color_family matches a dislike", () => {
  const products = [
    makeProduct({ id: "red", color_families: ["red"] }),
    makeProduct({ id: "blue", color_families: ["blue"] }),
    makeProduct({ id: "multi", color_families: ["beige", "Red"] }),
  ];
  const result = filterOutClientDislikes(products, {
    avoidBrands: [],
    dislikedColors: ["red"],
    dislikedFabrics: [],
  });
  assert.deepEqual(
    result.map((p) => p.id),
    ["blue"],
  );
});

test("filterOutClientDislikes: drops products whose primary fabric matches a dislike", () => {
  const products = [
    makeProduct({ id: "p1", primary_fabric: "polyester" }),
    makeProduct({ id: "p2", primary_fabric: "cotton" }),
    makeProduct({ id: "p3", primary_fabric: null }),
  ];
  const result = filterOutClientDislikes(products, {
    avoidBrands: [],
    dislikedColors: [],
    dislikedFabrics: ["Polyester"],
  });
  assert.deepEqual(
    result.map((p) => p.id),
    ["p2", "p3"],
  );
});

test("filterOutClientDislikes: returns the same array reference when no preferences", () => {
  const products = [makeProduct({ id: "a" })];
  const result = filterOutClientDislikes(products, {
    avoidBrands: [],
    dislikedColors: [],
    dislikedFabrics: [],
  });
  assert.equal(result, products);
});

test("rankByClientLikes: preferred brand matches surface first, then liked colors, stable thereafter", () => {
  const products = [
    makeProduct({ id: "a", brand_name: "Acme", color_families: ["red"] }),
    makeProduct({ id: "b", brand_name: "Bravo", color_families: ["blue"] }),
    makeProduct({ id: "c", brand_name: "Acme", color_families: ["green"] }),
    makeProduct({ id: "d", brand_name: "Delta", color_families: ["blue"] }),
    makeProduct({ id: "e", brand_name: "Echo", color_families: ["green"] }),
  ];
  const result = rankByClientLikes(products, {
    preferredBrands: ["acme"],
    likedColors: ["blue"],
  });
  assert.deepEqual(
    result.map((p) => p.id),
    ["a", "c", "b", "d", "e"],
  );
});

test("rankByClientLikes: returns the original array when no preferences", () => {
  const products = [makeProduct({ id: "a" }), makeProduct({ id: "b" })];
  const result = rankByClientLikes(products, {
    preferredBrands: [],
    likedColors: [],
  });
  assert.equal(result, products);
});
