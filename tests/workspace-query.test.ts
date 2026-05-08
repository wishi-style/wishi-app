/**
 * Workspace-query INVENTORY resolution tests.
 *
 * Pins the bug where the StylingRoom rendered bare inventoryProductId UUIDs
 * in Curated Pieces and showed "No preview" on Style Boards because
 * `getWorkspaceData` never round-tripped INVENTORY board items + SINGLE_ITEM
 * messages through the inventory client.
 *
 * Stubs `globalThis.fetch` so the inventory client returns a deterministic
 * product without touching tastegraph. Hits the real Postgres for the
 * boards / messages / cart fixtures (suiteSuffix-scoped so reruns don't
 * collide).
 */

import assert from "node:assert/strict";
import test, { before, after, beforeEach } from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { clearInventoryCache } from "@/lib/inventory/inventory-client";
import { getWorkspaceData } from "@/lib/sessions/workspace-query";

const isIntegrationEnv = !!process.env.DATABASE_URL;

const integrationTest = isIntegrationEnv ? test : test.skip;

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_INVENTORY_URL = process.env.INVENTORY_SERVICE_URL;

const suiteSuffix = randomUUID().slice(0, 8);
const PRODUCT_ID = `wq_${suiteSuffix}_inv1`;
const PRODUCT_FIXTURE = {
  id: PRODUCT_ID,
  canonical_name: "Hydra Trench Coat",
  canonical_description: "Lightweight water-resistant trench.",
  brand_id: "brand-h",
  brand_name: "Hydra Studio",
  category_id: "outerwear",
  category_slug: "outerwear",
  gender: "female",
  gtin: "",
  min_price: 245,
  max_price: 245,
  currency: "USD",
  in_stock: true,
  listing_count: 1,
  primary_image_url: "https://images.test/hydra.jpg",
  image_urls: ["https://images.test/hydra.jpg"],
  available_sizes: ["S", "M"],
  available_colors: ["Stone"],
  color_families: ["Beige"],
  primary_fabric: "cotton",
  fabric_tier: "premium",
  contains_leather: false,
  updated_at: new Date().toISOString(),
  listings: [],
};

let clientUserId = "";
let sessionId = "";

before(async () => {
  if (!isIntegrationEnv) return;
  process.env.INVENTORY_SERVICE_URL = "http://inventory.test";
  globalThis.fetch = (async (
    input: URL | Request | string,
  ): Promise<Response> => {
    const url = input instanceof URL ? input.toString() : typeof input === "string" ? input : input.url;
    if (url.includes(`/search/products/${encodeURIComponent(PRODUCT_ID)}`)) {
      return new Response(JSON.stringify(PRODUCT_FIXTURE), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;

  const client = await prisma.user.create({
    data: {
      email: `wq-${suiteSuffix}@test.local`,
      firstName: "WQ",
      lastName: "Tester",
      role: "CLIENT",
      referralCode: `WQ${suiteSuffix.toUpperCase()}`,
    },
  });
  clientUserId = client.id;

  const session = await prisma.session.create({
    data: {
      clientId: clientUserId,
      planType: "MAJOR",
      amountPaidInCents: 13000,
      styleboardsAllowed: 3,
      status: "ACTIVE",
    },
  });
  sessionId = session.id;
});

beforeEach(async () => {
  if (!isIntegrationEnv) return;
  clearInventoryCache();
  await prisma.boardItem.deleteMany({
    where: { board: { sessionId } },
  });
  await prisma.board.deleteMany({ where: { sessionId } });
  await prisma.message.deleteMany({ where: { sessionId } });
});

after(async () => {
  if (!isIntegrationEnv) return;
  await prisma.message.deleteMany({ where: { sessionId } });
  await prisma.boardItem.deleteMany({ where: { board: { sessionId } } });
  await prisma.board.deleteMany({ where: { sessionId } });
  await prisma.session.deleteMany({ where: { id: sessionId } });
  await prisma.user.deleteMany({ where: { id: clientUserId } });
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_INVENTORY_URL === undefined) {
    delete process.env.INVENTORY_SERVICE_URL;
  } else {
    process.env.INVENTORY_SERVICE_URL = ORIGINAL_INVENTORY_URL;
  }
});

integrationTest(
  "getWorkspaceData hydrates INVENTORY board items into curated tiles",
  async () => {
    const board = await prisma.board.create({
      data: {
        type: "STYLEBOARD",
        sessionId,
        sentAt: new Date(),
        title: "Test board",
      },
    });
    await prisma.boardItem.create({
      data: {
        boardId: board.id,
        source: "INVENTORY",
        inventoryProductId: PRODUCT_ID,
        orderIndex: 0,
      },
    });

    const data = await getWorkspaceData(sessionId, clientUserId);

    const tile = data.curated.find((c) => c.source === "INVENTORY");
    assert.ok(tile, "curated tile rendered for INVENTORY board item");
    assert.equal(tile.imageUrl, PRODUCT_FIXTURE.primary_image_url);
    assert.equal(tile.brand, PRODUCT_FIXTURE.brand_name);
    assert.equal(tile.label, PRODUCT_FIXTURE.canonical_name);
    assert.equal(
      tile.inventoryProductId,
      PRODUCT_ID,
      "PDP click target preserved on the tile",
    );
  },
);

integrationTest(
  "getWorkspaceData uses the first INVENTORY item's image as the styleboard thumbnail",
  async () => {
    const board = await prisma.board.create({
      data: {
        type: "STYLEBOARD",
        sessionId,
        sentAt: new Date(),
        title: "Thumb board",
      },
    });
    await prisma.boardItem.create({
      data: {
        boardId: board.id,
        source: "INVENTORY",
        inventoryProductId: PRODUCT_ID,
        orderIndex: 0,
      },
    });

    const data = await getWorkspaceData(sessionId, clientUserId);
    const summary = data.boards.find((b) => b.id === board.id);
    assert.ok(summary, "board summary present");
    assert.equal(
      summary.thumbnailUrl,
      PRODUCT_FIXTURE.primary_image_url,
      "thumbnail resolved from the first INVENTORY item",
    );
  },
);

integrationTest(
  "getWorkspaceData hydrates SINGLE_ITEM messages with product data",
  async () => {
    await prisma.message.create({
      data: {
        sessionId,
        userId: clientUserId,
        kind: "SINGLE_ITEM",
        singleItemInventoryProductId: PRODUCT_ID,
        twilioMessageSid: `IM_wq_${suiteSuffix}_msg`,
      },
    });

    const data = await getWorkspaceData(sessionId, clientUserId);
    const single = data.curated.find((c) => c.source === "SINGLE_ITEM");
    assert.ok(single, "single-item tile present");
    assert.equal(single.imageUrl, PRODUCT_FIXTURE.primary_image_url);
    assert.equal(single.label, PRODUCT_FIXTURE.canonical_name);
    assert.equal(single.brand, PRODUCT_FIXTURE.brand_name);
    assert.equal(single.inventoryProductId, PRODUCT_ID);
  },
);
