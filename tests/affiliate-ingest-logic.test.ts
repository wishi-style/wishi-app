import assert from "node:assert/strict";
import test from "node:test";
import { decideCommissionAction } from "@/workers/affiliate-ingest";
import type { AffiliateClickWithOrder } from "@/lib/affiliate/click-service";

function makeClick(
  id: string,
  overrides: Partial<AffiliateClickWithOrder> = {},
): AffiliateClickWithOrder {
  const base: AffiliateClickWithOrder = {
    id,
    userId: "u1",
    inventoryProductId: "p1",
    inventoryListingId: null,
    retailer: "Nordstrom",
    url: "https://nordstrom.com/x",
    sessionId: null,
    boardId: null,
    orderId: null,
    clickedAt: new Date(),
    promptSentAt: null,
    createdAt: new Date(),
    order: null,
  };
  return { ...base, ...overrides };
}

function orderOf(
  source: "DIRECT_SALE" | "SELF_REPORTED" | "AFFILIATE_CONFIRMED",
) {
  return {
    id: "o1",
    userId: "u1",
    sessionId: null,
    source,
    status: "PENDING" as const,
    retailer: "Nordstrom",
    totalInCents: 0,
    commissionInCents: null,
    orderReference: null,
    currency: "usd",
    arrivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

test("decideCommissionAction returns 'skip' when no candidates exist", () => {
  assert.equal(decideCommissionAction([]), "skip");
});

test("decideCommissionAction returns 'skip' when any candidate already has AFFILIATE_CONFIRMED", () => {
  const candidates = [
    makeClick("c1", { orderId: "o1", order: orderOf("AFFILIATE_CONFIRMED") }),
    makeClick("c2"),
  ];
  assert.equal(decideCommissionAction(candidates), "skip");
});

test("decideCommissionAction returns 'upgrade' when a candidate has SELF_REPORTED", () => {
  const candidates = [
    makeClick("c1", { orderId: "o1", order: orderOf("SELF_REPORTED") }),
  ];
  assert.equal(decideCommissionAction(candidates), "upgrade");
});

test("decideCommissionAction returns 'create' when candidates exist but none have an order", () => {
  const candidates = [makeClick("c1"), makeClick("c2")];
  assert.equal(decideCommissionAction(candidates), "create");
});

test("decideCommissionAction prefers 'skip' over 'upgrade' when CONFIRMED coexists with SELF_REPORTED", () => {
  const candidates = [
    makeClick("c1", { orderId: "o1", order: orderOf("AFFILIATE_CONFIRMED") }),
    makeClick("c2", { orderId: "o2", order: orderOf("SELF_REPORTED") }),
  ];
  assert.equal(decideCommissionAction(candidates), "skip");
});

test("decideCommissionAction ignores SELF_REPORTED without orderId (data invariant violation)", () => {
  const candidates = [
    makeClick("c1", { order: orderOf("SELF_REPORTED") }), // orderId missing
  ];
  // Falls through to "create" since no valid upgrade target.
  assert.equal(decideCommissionAction(candidates), "create");
});
