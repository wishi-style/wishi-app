import assert from "node:assert/strict";
import test from "node:test";
import { deriveSmartDefaults } from "@/lib/inventory/shop-inventory.defaults";
import type { ClientStylingContext } from "@/lib/inventory/client-context";

function makeCtx(over: Partial<ClientStylingContext> = {}): ClientStylingContext {
  return {
    clientId: "u1",
    clientFirstName: "Sarah",
    inventoryGender: "women",
    sizesByCategory: {},
    budgetsByCategory: {},
    avoidBrands: [],
    preferredBrands: [],
    likedColors: [],
    dislikedColors: [],
    dislikedFabrics: [],
    dislikedPatterns: [],
    excludeLeatherByDefault: false,
    ...over,
  };
}

test("deriveSmartDefaults: empty profile applies only in-stock", () => {
  const ctx = makeCtx({ inventoryGender: undefined });
  const { merged, applied } = deriveSmartDefaults(ctx, {}, "all", new Set());
  // gender skipped (undefined ctx), size/budget category=all, leather off
  assert.equal(applied.length, 1);
  assert.equal(applied[0].kind, "in_stock");
  assert.equal(merged.inStockOnly, true);
});

test("deriveSmartDefaults: gender + in-stock apply at category=all", () => {
  const ctx = makeCtx({ inventoryGender: "women" });
  const { merged, applied } = deriveSmartDefaults(ctx, {}, "all", new Set());
  const kinds = applied.map((d) => d.kind).sort();
  assert.deepEqual(kinds, ["gender", "in_stock"]);
  assert.equal(merged.gender, "women");
  assert.equal(merged.inStockOnly, true);
});

test("deriveSmartDefaults: size + budget fire on category bucket", () => {
  const ctx = makeCtx({
    inventoryGender: "women",
    sizesByCategory: { tops: "M", bottoms: "28" },
    budgetsByCategory: { tops: [200, 400] },
  });
  const { merged, applied } = deriveSmartDefaults(ctx, {}, "tops", new Set());
  const kinds = applied.map((d) => d.kind).sort();
  assert.deepEqual(kinds, ["budget", "gender", "in_stock", "size"]);
  assert.deepEqual(merged.sizes, ["M"]);
  assert.equal(merged.minPrice, 200);
  assert.equal(merged.maxPrice, 400);
  // reason includes client first name
  const sizeChip = applied.find((d) => d.kind === "size")!;
  assert.ok(sizeChip.reason.includes("Sarah"));
});

test("deriveSmartDefaults: explicit override suppresses default", () => {
  const ctx = makeCtx({
    sizesByCategory: { tops: "M" },
    budgetsByCategory: { tops: [200, 400] },
  });
  const { merged, applied } = deriveSmartDefaults(
    ctx,
    { sizes: ["L"] },
    "tops",
    new Set(),
  );
  // size NOT in applied (stylist set it)
  assert.ok(applied.every((d) => d.kind !== "size"));
  assert.deepEqual(merged.sizes, ["L"]);
});

test("deriveSmartDefaults: dismissed kinds excluded", () => {
  const ctx = makeCtx({
    sizesByCategory: { tops: "M" },
    excludeLeatherByDefault: true,
  });
  const { applied } = deriveSmartDefaults(
    ctx,
    {},
    "tops",
    new Set(["size", "exclude_leather"]),
  );
  assert.ok(applied.every((d) => d.kind !== "size"));
  assert.ok(applied.every((d) => d.kind !== "exclude_leather"));
});

test("deriveSmartDefaults: budget for category=all is skipped", () => {
  const ctx = makeCtx({
    budgetsByCategory: { tops: [200, 400] },
  });
  const { merged, applied } = deriveSmartDefaults(ctx, {}, "all", new Set());
  assert.ok(applied.every((d) => d.kind !== "budget"));
  assert.equal(merged.minPrice, undefined);
});

test("deriveSmartDefaults: budget partial override (max only)", () => {
  const ctx = makeCtx({
    budgetsByCategory: { tops: [200, 400] },
  });
  const { merged, applied } = deriveSmartDefaults(
    ctx,
    { maxPrice: 600 },
    "tops",
    new Set(),
  );
  const budgetChip = applied.find((d) => d.kind === "budget");
  // The chip still fires because minPrice wasn't set explicitly
  assert.ok(budgetChip);
  assert.equal(merged.minPrice, 200);
  assert.equal(merged.maxPrice, 600); // stylist's override wins
});

test("deriveSmartDefaults: exclude leather fires only when client dislikes leather", () => {
  const ctxNo = makeCtx({ excludeLeatherByDefault: false });
  const { applied: appliedNo } = deriveSmartDefaults(ctxNo, {}, "all", new Set());
  assert.ok(appliedNo.every((d) => d.kind !== "exclude_leather"));

  const ctxYes = makeCtx({ excludeLeatherByDefault: true });
  const { applied: appliedYes, merged } = deriveSmartDefaults(
    ctxYes,
    {},
    "all",
    new Set(),
  );
  assert.ok(appliedYes.some((d) => d.kind === "exclude_leather"));
  assert.equal(merged.excludeLeather, true);
});
