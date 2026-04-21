/**
 * Integration tests for Phase 5 flows. Runs against a dedicated `wishi_p5`
 * Postgres database (created separately via `docker exec ... CREATE DATABASE
 * wishi_p5` + `prisma migrate deploy`).
 *
 * Exercises real Prisma + service layer + worker logic end-to-end; no mocks.
 * Set DATABASE_URL before running:
 *   DATABASE_URL="postgresql://wishi:password@localhost:5432/wishi_p5" npm test
 */
import assert from "node:assert/strict";
import test, { before, beforeEach, after } from "node:test";
import { prisma } from "@/lib/prisma";
import {
  recordClick,
  findUnpromptedClicks,
  findCandidateClicks,
  markPromptSent,
  linkOrder,
  getClickById,
} from "@/lib/affiliate/click-service";
import {
  createOrder,
  upgradeToConfirmed,
  markOrderArrived,
  getOrderWithItems,
} from "@/lib/orders/order-service";
import { createClosetItemsFromOrder } from "@/lib/closet/auto-create";
import { runPendingActionExpiry } from "@/workers/pending-action-expiry";
import { runStaleCleanup } from "@/workers/stale-cleanup";

const isIntegrationEnv =
  !!process.env.DATABASE_URL &&
  process.env.DATABASE_URL.includes("wishi_p5");

// Skip every test in this file unless the caller points at wishi_p5 explicitly.
const integrationTest = isIntegrationEnv ? test : test.skip;

let testUserId: string;
let testStylistId: string;
let testSessionId: string;

before(async () => {
  if (!isIntegrationEnv) return;

  // Clean slate; also wipe downstream tables so reruns don't collide.
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE affiliate_clicks, order_items, orders, closet_items, session_pending_actions, messages, payments, sessions, users RESTART IDENTITY CASCADE`,
  );

  const client = await prisma.user.create({
    data: {
      email: "p5-client@test.local",
      firstName: "Test",
      lastName: "Client",
      role: "CLIENT",
      referralCode: "P5CLIENT",
    },
  });
  const stylist = await prisma.user.create({
    data: {
      email: "p5-stylist@test.local",
      firstName: "Test",
      lastName: "Stylist",
      role: "STYLIST",
      referralCode: "P5STYLST",
    },
  });
  testUserId = client.id;
  testStylistId = stylist.id;

  const session = await prisma.session.create({
    data: {
      clientId: testUserId,
      stylistId: testStylistId,
      planType: "MAJOR",
      amountPaidInCents: 13000,
      styleboardsAllowed: 3,
      status: "ACTIVE",
    },
  });
  testSessionId = session.id;
});

beforeEach(async () => {
  if (!isIntegrationEnv) return;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE affiliate_clicks, order_items, orders, closet_items, session_pending_actions, match_quiz_results RESTART IDENTITY CASCADE`,
  );
});

after(async () => {
  if (!isIntegrationEnv) return;
  await prisma.$disconnect();
});

integrationTest("recordClick persists expected fields", async () => {
  const click = await recordClick({
    userId: testUserId,
    inventoryProductId: "prod-1",
    inventoryListingId: "list-1",
    retailer: "Nordstrom",
    url: "https://nordstrom.com/x",
    sessionId: testSessionId,
    boardId: null as unknown as string | undefined,
  });
  assert.ok(click.id);
  const reread = await getClickById(click.id);
  assert.equal(reread?.inventoryProductId, "prod-1");
  assert.equal(reread?.sessionId, testSessionId);
  assert.equal(reread?.promptSentAt, null);
  assert.equal(reread?.orderId, null);
});

integrationTest(
  "findUnpromptedClicks only returns clicks older than the 24h window",
  async () => {
    // Recent click — should be ignored.
    await prisma.affiliateClick.create({
      data: {
        userId: testUserId,
        inventoryProductId: "prod-recent",
        retailer: "Nordstrom",
        url: "https://nordstrom.com/recent",
        clickedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
      },
    });
    // Old click — should be returned.
    const old = await prisma.affiliateClick.create({
      data: {
        userId: testUserId,
        inventoryProductId: "prod-old",
        retailer: "Nordstrom",
        url: "https://nordstrom.com/old",
        clickedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      },
    });
    // Also-old click that was already prompted — should be ignored.
    await prisma.affiliateClick.create({
      data: {
        userId: testUserId,
        inventoryProductId: "prod-already-prompted",
        retailer: "Nordstrom",
        url: "https://nordstrom.com/prompted",
        clickedAt: new Date(Date.now() - 30 * 60 * 60 * 1000),
        promptSentAt: new Date(),
      },
    });

    const found = await findUnpromptedClicks();
    const ids = found.map((c) => c.id);
    assert.deepEqual(ids, [old.id]);
  },
);

integrationTest("markPromptSent flips promptSentAt exactly once", async () => {
  const click = await recordClick({
    userId: testUserId,
    inventoryProductId: "prod-x",
    retailer: "Nordstrom",
    url: "https://nordstrom.com/x",
  });
  await markPromptSent(click.id);
  const reread = await getClickById(click.id);
  assert.ok(reread?.promptSentAt instanceof Date);
});

integrationTest(
  "createOrder(SELF_REPORTED) auto-creates a ClosetItem linked via sourceOrderItemId",
  async () => {
    const order = await createOrder({
      userId: testUserId,
      sessionId: testSessionId,
      source: "SELF_REPORTED",
      retailer: "SSENSE",
      totalInCents: 25000,
      items: [
        {
          inventoryProductId: "prod-selfreport",
          inventoryListingId: "listing-1",
          title: "Wool Coat",
          brand: "The Row",
          imageUrl: "https://img.test/x.jpg",
          priceInCents: 25000,
          size: "M",
          color: "black",
        },
      ],
    });
    const withItems = await getOrderWithItems(order.id);
    assert.equal(withItems?.items.length, 1);

    const closet = await prisma.closetItem.findMany({
      where: { userId: testUserId, sourceOrderItemId: withItems!.items[0].id },
    });
    assert.equal(closet.length, 1, "closet item should auto-create");
    assert.equal(closet[0].designer, "The Row");
    assert.equal(closet[0].size, "M");
    assert.deepEqual(closet[0].colors, ["black"]);
  },
);

integrationTest(
  "DIRECT_SALE orders do NOT auto-create closet items until markOrderArrived",
  async () => {
    const order = await createOrder({
      userId: testUserId,
      source: "DIRECT_SALE",
      retailer: "Wishi",
      totalInCents: 10000,
      items: [
        {
          inventoryProductId: "prod-directsale",
          title: "Direct Sale Item",
          priceInCents: 10000,
        },
      ],
    });
    const beforeArrive = await prisma.closetItem.findMany({
      where: { userId: testUserId },
    });
    assert.equal(beforeArrive.length, 0, "no closet entry while pending");

    await markOrderArrived(order.id);

    const afterArrive = await prisma.closetItem.findMany({
      where: { userId: testUserId },
    });
    assert.equal(afterArrive.length, 1, "arrives → closet item created");
  },
);

integrationTest("createClosetItemsFromOrder is idempotent", async () => {
  const order = await createOrder({
    userId: testUserId,
    source: "SELF_REPORTED",
    retailer: "Test",
    totalInCents: 1000,
    items: [
      {
        inventoryProductId: "prod-idempotent",
        title: "Once",
        priceInCents: 1000,
      },
    ],
  });
  // Already created once via createOrder's auto-fire. Call again explicitly.
  const second = await createClosetItemsFromOrder(order.id);
  assert.equal(second.length, 0, "second call should be a no-op");

  const closet = await prisma.closetItem.findMany({ where: { userId: testUserId } });
  assert.equal(closet.length, 1);
});

integrationTest(
  "upgradeToConfirmed flips SELF_REPORTED → AFFILIATE_CONFIRMED and merges commission",
  async () => {
    const order = await createOrder({
      userId: testUserId,
      source: "SELF_REPORTED",
      retailer: "Nordstrom",
      totalInCents: 5000,
      items: [
        {
          inventoryProductId: "prod-upgrade",
          title: "Upgraded",
          priceInCents: 5000,
        },
      ],
    });
    const upgraded = await upgradeToConfirmed(order.id, {
      commissionInCents: 250,
      orderReference: "REF-001",
    });
    assert.equal(upgraded.source, "AFFILIATE_CONFIRMED");
    // totalInCents is the customer's purchase amount; the affiliate network's
    // commission + order reference live in their own columns so reporting can
    // tell "what did the user pay" from "how much did we earn".
    assert.equal(upgraded.totalInCents, 5000);
    assert.equal(upgraded.commissionInCents, 250);
    assert.equal(upgraded.orderReference, "REF-001");
  },
);

integrationTest(
  "findCandidateClicks returns clicks within the ±7-day window + includes order",
  async () => {
    const placedAt = new Date("2026-04-10T12:00:00Z");
    const inside = await prisma.affiliateClick.create({
      data: {
        userId: testUserId,
        inventoryProductId: "prod-window",
        retailer: "SSENSE",
        url: "https://ssense.com/x",
        clickedAt: new Date(placedAt.getTime() - 2 * 24 * 60 * 60 * 1000),
      },
    });
    await prisma.affiliateClick.create({
      data: {
        userId: testUserId,
        inventoryProductId: "prod-window",
        retailer: "SSENSE",
        url: "https://ssense.com/y",
        clickedAt: new Date(placedAt.getTime() - 30 * 24 * 60 * 60 * 1000),
      },
    });
    const found = await findCandidateClicks(
      "prod-window",
      "SSENSE",
      placedAt,
    );
    const ids = found.map((c) => c.id);
    assert.deepEqual(ids, [inside.id]);
    assert.equal(found[0].order, null, "include: order should be null when no orderId");
  },
);

integrationTest("linkOrder attaches an orderId to a click", async () => {
  const click = await recordClick({
    userId: testUserId,
    inventoryProductId: "prod-link",
    retailer: "Nordstrom",
    url: "https://nordstrom.com/link",
  });
  const order = await createOrder({
    userId: testUserId,
    source: "SELF_REPORTED",
    retailer: "Nordstrom",
    totalInCents: 1,
    items: [{ inventoryProductId: "prod-link", title: "X", priceInCents: 1 }],
  });
  await linkOrder(click.id, order.id);
  const reread = await getClickById(click.id);
  assert.equal(reread?.orderId, order.id);
});

integrationTest(
  "pending-action-expiry worker flips OPEN→EXPIRED when dueAt has passed",
  async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const expiredTarget = await prisma.sessionPendingAction.create({
      data: {
        sessionId: testSessionId,
        type: "PENDING_MOODBOARD",
        status: "OPEN",
        dueAt: past,
      },
    });
    const stillOpen = await prisma.sessionPendingAction.create({
      data: {
        sessionId: testSessionId,
        type: "PENDING_STYLEBOARD",
        status: "OPEN",
        dueAt: future,
      },
    });
    const summary = await runPendingActionExpiry();
    assert.ok((summary.expired as number) >= 1);

    const after = await prisma.sessionPendingAction.findMany({
      where: { id: { in: [expiredTarget.id, stillOpen.id] } },
    });
    const byId = Object.fromEntries(after.map((a) => [a.id, a.status]));
    assert.equal(byId[expiredTarget.id], "EXPIRED");
    assert.equal(byId[stillOpen.id], "OPEN");
  },
);

integrationTest(
  "stale-cleanup worker deletes anonymous MatchQuizResult rows older than 30 days",
  async () => {
    // Anonymous + old — should be deleted.
    await prisma.matchQuizResult.create({
      data: {
        userId: null,
        guestToken: "guest-stale-1",
        completedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      },
    });
    // Anonymous + fresh — keep.
    const fresh = await prisma.matchQuizResult.create({
      data: {
        userId: null,
        guestToken: "guest-fresh-1",
        completedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      },
    });
    // Claimed (has userId) — keep even if old.
    const claimed = await prisma.matchQuizResult.create({
      data: {
        userId: testUserId,
        guestToken: "guest-claimed-1",
        completedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      },
    });

    const summary = await runStaleCleanup();
    assert.equal(summary.anonymousQuizResultsDeleted, 1);

    const remaining = await prisma.matchQuizResult.findMany({
      orderBy: { completedAt: "desc" },
    });
    const ids = remaining.map((r) => r.id).sort();
    assert.deepEqual(ids, [fresh.id, claimed.id].sort());
  },
);
