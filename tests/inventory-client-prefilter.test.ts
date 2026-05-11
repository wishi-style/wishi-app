import assert from "node:assert/strict";
import test from "node:test";
import {
  filterOutClientDislikes,
  mapGenderToInventory,
  rankByClientLikes,
} from "@/lib/inventory/client-prefilter";
import type { ProductSearchDoc, ProductListing } from "@/lib/inventory/types";

function makeListing(overrides: Partial<ProductListing> = {}): ProductListing {
  return {
    listing_id: "l1",
    merchant_id: "m1",
    merchant_name: "Test Merchant",
    title: "",
    product_url: "",
    affiliate_url: "",
    primary_image_url: "",
    base_price: 50,
    sale_price: 50,
    commission_percent: 0,
    shipping_price: 0,
    free_shipping: false,
    shipping_service: "",
    is_active: true,
    in_stock: true,
    updated_at: "",
    material_raw: "",
    primary_fabric: "",
    fabric_tier: "",
    contains_leather: false,
    fabric_composition: "",
    pattern: "",
    variants: [],
    ...overrides,
  };
}

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

const EMPTY_PREFS = {
  avoidBrands: [] as string[],
  dislikedColors: [] as string[],
  dislikedFabrics: [] as string[],
  dislikedPatterns: [] as string[],
};

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

test("avoid brands: exact-match drops, case-insensitive", () => {
  const products = [
    makeProduct({ id: "a", brand_name: "Lululemon" }),
    makeProduct({ id: "b", brand_name: "Patagonia" }),
    makeProduct({ id: "c", brand_name: "  lululemon  " }),
  ];
  const result = filterOutClientDislikes(products, {
    ...EMPTY_PREFS,
    avoidBrands: ["LULULEMON"],
  });
  assert.deepEqual(
    result.map((p) => p.id),
    ["b"],
  );
});

test("avoid brands: substring catches 'Hermes' inside 'Pre-owned Hermes'", () => {
  const products = [
    makeProduct({ id: "a", brand_name: "Pre-owned Hermes" }),
    makeProduct({ id: "b", brand_name: "Hermes" }),
    makeProduct({ id: "c", brand_name: "Goyard" }),
  ];
  const result = filterOutClientDislikes(products, {
    ...EMPTY_PREFS,
    avoidBrands: ["Hermes"],
  });
  assert.deepEqual(
    result.map((p) => p.id),
    ["c"],
  );
});

test("disliked colors: color_families exact match drops", () => {
  const products = [
    makeProduct({ id: "red", color_families: ["red"] }),
    makeProduct({ id: "blue", color_families: ["blue"] }),
    makeProduct({ id: "multi", color_families: ["beige", "Red"] }),
  ];
  const result = filterOutClientDislikes(products, {
    ...EMPTY_PREFS,
    dislikedColors: ["red"],
  });
  assert.deepEqual(
    result.map((p) => p.id),
    ["blue"],
  );
});

test("disliked colors: 'neon' falls through color_families to available_colors / canonical_name", () => {
  const products = [
    makeProduct({ id: "neon-yellow-shoe", available_colors: ["neon yellow"] }),
    makeProduct({ id: "neon-in-name", canonical_name: "Neon Striped Tee" }),
    makeProduct({ id: "redo-shoe", canonical_name: "Redo Sneaker" }),
    makeProduct({ id: "plain", canonical_name: "Black Tee" }),
  ];
  const result = filterOutClientDislikes(products, {
    ...EMPTY_PREFS,
    dislikedColors: ["neon"],
  });
  assert.deepEqual(
    result.map((p) => p.id).sort(),
    ["plain", "redo-shoe"],
  );
});

test("disliked colors: word-boundary so 'red' does not match 'redo'", () => {
  const products = [
    makeProduct({ id: "red-tee", canonical_name: "Red Cotton Tee" }),
    makeProduct({ id: "redo-tee", canonical_name: "Redo Cotton Tee" }),
  ];
  const result = filterOutClientDislikes(products, {
    ...EMPTY_PREFS,
    dislikedColors: ["red"],
  });
  assert.deepEqual(
    result.map((p) => p.id),
    ["redo-tee"],
  );
});

test("disliked fabrics: substring catches 'polyester blend' and 'poly-cotton' style", () => {
  const products = [
    makeProduct({ id: "primary-only", primary_fabric: "polyester" }),
    makeProduct({ id: "primary-blend", primary_fabric: "polyester blend" }),
    makeProduct({
      id: "listing-only",
      primary_fabric: null,
      listings: [makeListing({ material_raw: "100% polyester" })],
    }),
    makeProduct({ id: "cotton", primary_fabric: "cotton" }),
    makeProduct({ id: "null-fabric", primary_fabric: null }),
  ];
  const result = filterOutClientDislikes(products, {
    ...EMPTY_PREFS,
    dislikedFabrics: ["Polyester"],
  });
  assert.deepEqual(
    result.map((p) => p.id),
    ["cotton", "null-fabric"],
  );
});

test("disliked patterns: animal_print catches 'leopard' / 'zebra' / 'snake' in canonical_name", () => {
  const products = [
    makeProduct({ id: "leopard-coat", canonical_name: "Leopard Print Coat" }),
    makeProduct({ id: "zebra-bag", canonical_name: "Zebra Stripe Bag" }),
    makeProduct({ id: "snake-belt", canonical_name: "Snakeskin Belt" }),
    makeProduct({ id: "polka", canonical_name: "Polka Dot Dress" }),
    makeProduct({ id: "plain", canonical_name: "Black Wool Coat" }),
  ];
  const result = filterOutClientDislikes(products, {
    ...EMPTY_PREFS,
    dislikedPatterns: ["animal_print"],
  });
  assert.deepEqual(
    result.map((p) => p.id),
    ["polka", "plain"],
  );
});

test("disliked patterns: polka_dots and plaid use synonym variants", () => {
  const products = [
    makeProduct({ id: "polka-dot", canonical_name: "Polka Dot Dress" }),
    makeProduct({ id: "polkadot", canonical_name: "Polkadot Tie" }),
    makeProduct({ id: "tartan", canonical_name: "Tartan Plaid Skirt" }),
    makeProduct({ id: "buffalo", canonical_name: "Buffalo Check Shirt" }),
    makeProduct({ id: "plain", canonical_name: "Black Tee" }),
  ];
  const result = filterOutClientDislikes(products, {
    ...EMPTY_PREFS,
    dislikedPatterns: ["polka_dots", "plaid"],
  });
  assert.deepEqual(
    result.map((p) => p.id),
    ["plain"],
  );
});

test("disliked patterns: also matches listings[].pattern field when set", () => {
  const products = [
    makeProduct({
      id: "from-listing",
      canonical_name: "Cotton Coat",
      listings: [makeListing({ pattern: "Floral" })],
    }),
    makeProduct({
      id: "no-pattern",
      canonical_name: "Cotton Coat",
      listings: [makeListing({ pattern: "" })],
    }),
  ];
  const result = filterOutClientDislikes(products, {
    ...EMPTY_PREFS,
    dislikedPatterns: ["floral"],
  });
  assert.deepEqual(
    result.map((p) => p.id),
    ["no-pattern"],
  );
});

test("returns the same array reference when no preferences populated", () => {
  const products = [makeProduct({ id: "a" })];
  const result = filterOutClientDislikes(products, EMPTY_PREFS);
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

test("rankByClientLikes: liked colors also catch substring in available_colors", () => {
  const products = [
    makeProduct({ id: "hot-pink", available_colors: ["hot pink"] }),
    makeProduct({ id: "navy", available_colors: ["navy"] }),
  ];
  const result = rankByClientLikes(products, {
    preferredBrands: [],
    likedColors: ["pink"],
  });
  assert.deepEqual(
    result.map((p) => p.id),
    ["hot-pink", "navy"],
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
