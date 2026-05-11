import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

/**
 * Service-level test for the shop-inventory orchestration pipeline.
 * We stub global fetch + the prisma module so the service runs end-to-end
 * without hitting the network or the database.
 */

// Mock prisma BEFORE importing anything that touches the inventory module.
type AnyRecord = Record<string, unknown>;
const mockPrisma: AnyRecord = {
  session: {
    findUnique: async () => ({
      clientId: "u1",
      client: { firstName: "Sarah", gender: null },
    }),
  },
  bodyProfile: {
    findUnique: async () => ({
      sizes: [{ category: "tops", size: "M" }],
    }),
  },
  budgetByCategory: {
    findMany: async () => [
      { category: "tops", minInCents: 20000, maxInCents: 40000 },
    ],
  },
  matchQuizResult: {
    findFirst: async () => ({ genderToStyle: "FEMALE" }),
  },
  styleProfile: {
    findUnique: async () => ({
      avoidBrands: ["EvilBrand"],
      preferredBrands: ["GoodBrand"],
    }),
  },
  colorPreference: {
    findMany: async () => [
      { color: "pink", isLiked: false },
      { color: "navy", isLiked: true },
    ],
  },
  fabricPreference: {
    findMany: async () => [{ fabric: "leather" }],
  },
  patternPreference: {
    findMany: async () => [],
  },
};

// The prisma module exports a Proxy that resolves to `globalThis.prisma`
// lazily. Set the global before the service imports the module so calls
// route through our mock without hitting Postgres.
(globalThis as unknown as { prisma: unknown }).prisma = mockPrisma;
process.env.DATABASE_URL ??= "postgres://stub";

// Stub fetch for inventory-client calls.
const captured: { url: string; init: RequestInit | undefined }[] = [];
let nextSearchResponse: AnyRecord = {
  total: 1,
  page: 1,
  pageSize: 60,
  pages: 1,
  results: [],
};

before(() => {
  process.env.INVENTORY_SERVICE_URL = "http://test";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    captured.push({ url, init });
    if (url.endsWith("/search")) {
      return new Response(JSON.stringify(nextSearchResponse), { status: 200 });
    }
    if (url.includes("/search/products/")) {
      return new Response(
        JSON.stringify({
          id: "p1",
          listings: [{ listing_id: "l1" }],
          brand_name: "Sample",
          canonical_name: "Sample item",
        }),
        { status: 200 },
      );
    }
    if (url.endsWith("/search/embeddings")) {
      return new Response(
        JSON.stringify({ embeddings: { l1: Array(1024).fill(0.1) } }),
        { status: 200 },
      );
    }
    if (url.endsWith("/search/direction-embeddings")) {
      return new Response(
        JSON.stringify({
          embeddings: { l1: Array(768).fill(0.2), l2: Array(768).fill(0.4) },
        }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
});

beforeEach(async () => {
  captured.length = 0;
  nextSearchResponse = { total: 1, page: 1, pageSize: 60, pages: 1, results: [] };
  // Clear the inventory client's in-process cache between tests.
  const { clearInventoryCache } = await import(
    "@/lib/inventory/inventory-client"
  );
  clearInventoryCache();
});

test("empty query → no mode set (browse)", async () => {
  const { loadShopInventory } = await import(
    "@/lib/inventory/shop-inventory.service"
  );
  await loadShopInventory({ sessionId: "s1", page: 1, pageSize: 60 });
  const searchCall = captured.find((c) => c.url.endsWith("/search"));
  assert.ok(searchCall, "expected /search to be called");
  const body = JSON.parse(searchCall!.init?.body as string);
  assert.equal(body.mode, undefined);
  assert.equal(body.semanticQuery, undefined);
});

test("non-empty query → semantic mode", async () => {
  const { loadShopInventory } = await import(
    "@/lib/inventory/shop-inventory.service"
  );
  await loadShopInventory({
    sessionId: "s1",
    query: "  navy blazer  ",
    page: 1,
    pageSize: 60,
  });
  const searchCall = captured.find((c) => c.url.endsWith("/search"));
  const body = JSON.parse(searchCall!.init?.body as string);
  assert.equal(body.mode, "semantic");
  assert.equal(body.semanticQuery, "navy blazer");
});

test("keyword mode → fts + query, no semanticQuery", async () => {
  const { loadShopInventory } = await import(
    "@/lib/inventory/shop-inventory.service"
  );
  await loadShopInventory({
    sessionId: "s1",
    mode: "keyword",
    query: "blazer",
    page: 1,
    pageSize: 60,
  });
  const searchCall = captured.find((c) => c.url.endsWith("/search"));
  const body = JSON.parse(searchCall!.init?.body as string);
  assert.equal(body.mode, "fts");
  assert.equal(body.query, "blazer");
  assert.equal(body.semanticQuery, undefined);
});

test("similarToProductId → vector mode with 1024-dim queryVector", async () => {
  const { loadShopInventory } = await import(
    "@/lib/inventory/shop-inventory.service"
  );
  await loadShopInventory({
    sessionId: "s1",
    similarToProductId: "p1",
    page: 1,
    pageSize: 60,
  });
  const searchCall = captured.find((c) => c.url.endsWith("/search"));
  const body = JSON.parse(searchCall!.init?.body as string);
  assert.equal(body.mode, "vector");
  assert.equal(body.queryVector.length, 1024);
});

test("directionFromListingIds → direction mode with averaged 768-dim vector", async () => {
  const { loadShopInventory } = await import(
    "@/lib/inventory/shop-inventory.service"
  );
  await loadShopInventory({
    sessionId: "s1",
    directionFromListingIds: ["l1", "l2"],
    page: 1,
    pageSize: 60,
  });
  const searchCall = captured.find((c) => c.url.endsWith("/search"));
  const body = JSON.parse(searchCall!.init?.body as string);
  assert.equal(body.mode, "direction");
  assert.equal(body.queryVector.length, 768);
  // Average of 0.2 and 0.4 = 0.3
  assert.ok(Math.abs(body.queryVector[0] - 0.3) < 1e-9);
});

test("filters round-trip into the search DTO", async () => {
  const { loadShopInventory } = await import(
    "@/lib/inventory/shop-inventory.service"
  );
  await loadShopInventory({
    sessionId: "s1",
    merchantIds: ["m1"],
    brandIds: ["b1"],
    colors: ["navy"],
    sizes: ["M"],
    primaryFabrics: ["wool"],
    excludeLeather: true,
    inStockOnly: true,
    minPrice: 50,
    maxPrice: 500,
    gender: "women",
    page: 2,
    pageSize: 30,
  });
  const searchCall = captured.find((c) => c.url.endsWith("/search"));
  const body = JSON.parse(searchCall!.init?.body as string);
  assert.deepEqual(body.merchantIds, ["m1"]);
  assert.deepEqual(body.brandIds, ["b1"]);
  assert.deepEqual(body.colors, ["navy"]);
  assert.deepEqual(body.sizes, ["M"]);
  assert.equal(body.primaryFabrics[0], "wool");
  assert.equal(body.excludeLeather, true);
  assert.equal(body.inStockOnly, true);
  assert.equal(body.minPrice, 50);
  assert.equal(body.maxPrice, 500);
  assert.equal(body.gender, "women");
  assert.equal(body.page, 2);
  assert.equal(body.pageSize, 30);
});

test("client preferences drive smart defaults: in-stock + size + budget + exclude leather", async () => {
  const { loadShopInventory } = await import(
    "@/lib/inventory/shop-inventory.service"
  );
  const result = await loadShopInventory({
    sessionId: "s1",
    category: "tops",
    page: 1,
    pageSize: 60,
  });
  const applied = result.appliedSmartDefaults.map((d) => d.kind).sort();
  // Fixture sets BodyProfile size M + budget $200-$400 + leather dislike.
  // mapGenderToInventory("FEMALE") -> "women", so gender default fires too.
  assert.ok(applied.includes("in_stock"));
  assert.ok(applied.includes("size"));
  assert.ok(applied.includes("budget"));
  assert.ok(applied.includes("exclude_leather"));
  assert.ok(applied.includes("gender"));

  const searchCall = captured.find((c) => c.url.endsWith("/search"));
  const body = JSON.parse(searchCall!.init?.body as string);
  assert.deepEqual(body.sizes, ["M"]);
  assert.equal(body.minPrice, 200);
  assert.equal(body.maxPrice, 400);
  assert.equal(body.inStockOnly, true);
  assert.equal(body.excludeLeather, true);
  assert.equal(body.gender, "women");
});

test("dismissed defaults are not re-applied", async () => {
  const { loadShopInventory } = await import(
    "@/lib/inventory/shop-inventory.service"
  );
  const result = await loadShopInventory({
    sessionId: "s1",
    category: "tops",
    dismissedDefaults: ["size", "exclude_leather"],
    page: 1,
    pageSize: 60,
  });
  const applied = result.appliedSmartDefaults.map((d) => d.kind);
  assert.ok(!applied.includes("size"));
  assert.ok(!applied.includes("exclude_leather"));
  const searchCall = captured.find((c) => c.url.endsWith("/search"));
  const body = JSON.parse(searchCall!.init?.body as string);
  assert.equal(body.sizes, undefined);
  assert.equal(body.excludeLeather, undefined);
});

test("client dislike filter drops avoided-brand products post-fetch", async () => {
  const { loadShopInventory } = await import(
    "@/lib/inventory/shop-inventory.service"
  );
  nextSearchResponse = {
    total: 2,
    page: 1,
    pageSize: 60,
    pages: 1,
    results: [
      {
        id: "good",
        canonical_name: "Good item",
        canonical_description: null,
        brand_id: "g",
        brand_name: "GoodBrand",
        category_id: "c1",
        category_slug: "tops",
        gender: "women",
        gtin: "",
        min_price: 100,
        max_price: 100,
        currency: "USD",
        in_stock: true,
        listing_count: 1,
        primary_image_url: null,
        image_urls: [],
        available_sizes: ["M"],
        available_colors: [],
        color_families: [],
        primary_fabric: null,
        fabric_tier: null,
        contains_leather: false,
        updated_at: "",
        listings: [],
      },
      {
        id: "bad",
        canonical_name: "Bad item",
        canonical_description: null,
        brand_id: "e",
        brand_name: "EvilBrand", // <- ctx.avoidBrands
        category_id: "c1",
        category_slug: "tops",
        gender: "women",
        gtin: "",
        min_price: 100,
        max_price: 100,
        currency: "USD",
        in_stock: true,
        listing_count: 1,
        primary_image_url: null,
        image_urls: [],
        available_sizes: ["M"],
        available_colors: [],
        color_families: [],
        primary_fabric: null,
        fabric_tier: null,
        contains_leather: false,
        updated_at: "",
        listings: [],
      },
    ],
  };
  const result = await loadShopInventory({ sessionId: "s1", page: 1, pageSize: 60 });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, "good");
  // Service total stays 2; visibleApprox accounts for the dislike loss
  assert.equal(result.total, 2);
  assert.ok(result.visibleApprox <= result.total);
});
