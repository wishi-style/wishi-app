import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import {
  getFilters,
  lookupListings,
  getCommissions,
  iterateCommissions,
  clearInventoryCache,
} from "@/lib/inventory/inventory-client";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_URL = process.env.INVENTORY_SERVICE_URL;

function mockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  globalThis.fetch = async (input: URL | Request | string, init?: RequestInit) => {
    const url = input instanceof URL ? input.toString() : typeof input === "string" ? input : input.url;
    return handler(url, init);
  };
}

beforeEach(() => {
  clearInventoryCache();
  process.env.INVENTORY_SERVICE_URL = "http://inventory.test";
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_URL === undefined) delete process.env.INVENTORY_SERVICE_URL;
  else process.env.INVENTORY_SERVICE_URL = ORIGINAL_URL;
  clearInventoryCache();
});

test("getFilters returns data on 200 and caches the response", async () => {
  let calls = 0;
  mockFetch(() => {
    calls += 1;
    return new Response(
      JSON.stringify({
        brands: [{ id: "b1", name: "Acme" }],
        categories: [],
        colors: ["black"],
        sizes: ["S"],
        primaryFabrics: [],
        merchants: [],
        genders: ["women"],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  const first = await getFilters();
  const second = await getFilters();
  assert.equal(first.brands[0]?.name, "Acme");
  assert.deepEqual(second.colors, ["black"]);
  assert.equal(calls, 1, "second call should be a cache hit");
});

test("getFilters returns empty shape on non-200", async () => {
  mockFetch(() => new Response("nope", { status: 503 }));
  const result = await getFilters();
  assert.deepEqual(result, {
    brands: [],
    categories: [],
    colors: [],
    sizes: [],
    primaryFabrics: [],
    merchants: [],
    genders: [],
  });
});

test("getFilters returns empty shape when INVENTORY_SERVICE_URL is unset", async () => {
  delete process.env.INVENTORY_SERVICE_URL;
  const result = await getFilters();
  assert.deepEqual(result.brands, []);
});

test("lookupListings returns {} for empty input without hitting network", async () => {
  let called = false;
  mockFetch(() => {
    called = true;
    return new Response("{}", { status: 200 });
  });
  const result = await lookupListings([]);
  assert.deepEqual(result, {});
  assert.equal(called, false);
});

test("lookupListings caps payload at 200 ids", async () => {
  let sentCount: number | null = null;
  mockFetch(async (_url, init) => {
    const body = JSON.parse(init?.body as string) as { ids: string[] };
    sentCount = body.ids.length;
    return new Response(JSON.stringify({}), { status: 200 });
  });
  const bigList = Array.from({ length: 300 }, (_, i) => `id${i}`);
  await lookupListings(bigList);
  assert.equal(sentCount, 200);
});

test("lookupListings returns {} on fetch failure", async () => {
  mockFetch(() => {
    throw new Error("boom");
  });
  const result = await lookupListings(["x"]);
  assert.deepEqual(result, {});
});

test("getCommissions passes since as an ISO string query param", async () => {
  let capturedUrl = "";
  mockFetch((url) => {
    capturedUrl = url;
    return new Response(
      JSON.stringify({ data: [], cursor: null }),
      { status: 200 },
    );
  });
  const since = new Date("2026-04-15T00:00:00.000Z");
  await getCommissions({ since });
  assert.match(capturedUrl, /since_ingested=2026-04-15T00%3A00%3A00\.000Z/);
  assert.match(capturedUrl, /limit=1000/);
});

test("getCommissions caps limit at 1000", async () => {
  let capturedUrl = "";
  mockFetch((url) => {
    capturedUrl = url;
    return new Response(JSON.stringify({ data: [], cursor: null }), { status: 200 });
  });
  await getCommissions({ limit: 99_999 });
  assert.match(capturedUrl, /limit=1000/);
});

test("getCommissions forwards cursor and drops since when both given", async () => {
  let capturedUrl = "";
  mockFetch((url) => {
    capturedUrl = url;
    return new Response(JSON.stringify({ data: [], cursor: null }), { status: 200 });
  });
  await getCommissions({
    since: new Date("2026-04-15T00:00:00.000Z"),
    cursor: "abc123",
  });
  assert.match(capturedUrl, /cursor=abc123/);
  assert.doesNotMatch(capturedUrl, /since_ingested/);
});

test("iterateCommissions pages until cursor exhausts", async () => {
  const pages = [
    {
      data: [
        {
          listing_id: "l1",
          product_id: "p1",
          merchant_id: "m1",
          merchant_name: "X",
          order_reference: "r1",
          click_id: null,
          user_id: null,
          amount_in_cents: 100,
          commission_in_cents: 5,
          currency: "usd",
          order_placed_at: "2026-04-16T00:00:00Z",
          ingested_at: "2026-04-17T01:00:00Z",
        },
      ],
      cursor: "c1",
    },
    { data: [], cursor: null },
  ];
  let callIdx = 0;
  mockFetch(() => {
    const next = pages[Math.min(callIdx, pages.length - 1)];
    callIdx += 1;
    return new Response(JSON.stringify(next), { status: 200 });
  });

  const collected: string[] = [];
  for await (const batch of iterateCommissions()) {
    for (const ev of batch) collected.push(ev.listing_id);
  }
  assert.deepEqual(collected, ["l1"]);
});

test("iterateCommissions uses since on first call, cursor thereafter", async () => {
  const capturedUrls: string[] = [];
  const pages = [
    { data: [sampleEvent("l1")], cursor: "next-1" },
    { data: [sampleEvent("l2")], cursor: "next-2" },
    { data: [], cursor: null },
  ];
  let idx = 0;
  mockFetch((url) => {
    capturedUrls.push(url);
    const page = pages[Math.min(idx, pages.length - 1)];
    idx += 1;
    return new Response(JSON.stringify(page), { status: 200 });
  });

  const since = new Date("2026-04-15T00:00:00.000Z");
  const collected: string[] = [];
  for await (const batch of iterateCommissions(since)) {
    for (const ev of batch) collected.push(ev.listing_id);
  }
  assert.deepEqual(collected, ["l1", "l2"]);
  assert.match(capturedUrls[0], /since_ingested=2026-04-15T00%3A00%3A00\.000Z/);
  assert.doesNotMatch(capturedUrls[0], /cursor=/);
  assert.match(capturedUrls[1], /cursor=next-1/);
  assert.doesNotMatch(capturedUrls[1], /since_ingested=/);
  assert.match(capturedUrls[2], /cursor=next-2/);
});

function sampleEvent(listingId: string) {
  return {
    listing_id: listingId,
    product_id: `p-${listingId}`,
    merchant_id: "m1",
    merchant_name: "X",
    order_reference: `r-${listingId}`,
    click_id: null,
    user_id: null,
    amount_in_cents: 100,
    commission_in_cents: 5,
    currency: "usd",
    order_placed_at: "2026-04-16T00:00:00Z",
    ingested_at: "2026-04-17T01:00:00Z",
  };
}
