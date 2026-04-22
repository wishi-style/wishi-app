import assert from "node:assert/strict";
import test, { before } from "node:test";
import "dotenv/config";
import { getPlanPricesForUi } from "@/lib/plans";
import { getPool } from "./e2e/db";

before(async () => {
  const { rows } = await getPool().query("SELECT type FROM plans");
  if (rows.length === 0) {
    throw new Error("Plans table is empty — run `npx tsx prisma/seed.ts` first");
  }
});

test("getPlanPricesForUi returns Mini/Major/Lux prices from DB", async () => {
  const prices = await getPlanPricesForUi();
  assert.equal(prices.mini.priceInCents, 6000);
  assert.equal(prices.mini.displayDollars, 60);
  assert.equal(prices.major.priceInCents, 13000);
  assert.equal(prices.major.displayDollars, 130);
  assert.equal(prices.lux.priceInCents, 55000);
  assert.equal(prices.lux.displayDollars, 550);
});

test("getPlanPricesForUi includes the add-on (Buy More Looks) price", async () => {
  const prices = await getPlanPricesForUi();
  assert.equal(prices.additionalLookInCents, 2000);
  assert.equal(prices.additionalLookDollars, 20);
});

test("getPlanPricesForUi surfaces the Lux milestone amount + look number", async () => {
  const prices = await getPlanPricesForUi();
  assert.ok(
    prices.luxMilestoneInCents === null || typeof prices.luxMilestoneInCents === "number",
    "milestone must be null or a number"
  );
  assert.ok(
    prices.luxMilestoneLookNumber === null ||
      typeof prices.luxMilestoneLookNumber === "number",
    "milestone look number must be null or a number"
  );
});

test("getPlanPricesForUi returns the plan currency", async () => {
  const prices = await getPlanPricesForUi();
  assert.equal(prices.currency, "usd");
});
