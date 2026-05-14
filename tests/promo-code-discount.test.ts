import assert from "node:assert/strict";
import test from "node:test";

import { computeDiscountInCents } from "@/lib/promotions/promo-code.service";

test("AMOUNT discount caps at the base price", () => {
  // $550 off applied to a $60 line item ⇒ $60 (zeroes out, no negative).
  assert.equal(computeDiscountInCents("AMOUNT", 55000, 6000), 6000);
  // Smaller amount than base ⇒ full amount applies.
  assert.equal(computeDiscountInCents("AMOUNT", 2500, 13000), 2500);
});

test("PERCENT discount floors to whole cents (matches Stripe)", () => {
  assert.equal(computeDiscountInCents("PERCENT", 100, 55000), 55000);
  assert.equal(computeDiscountInCents("PERCENT", 50, 13000), 6500);
  assert.equal(computeDiscountInCents("PERCENT", 25, 6001), 1500); // 1500.25 → 1500
  assert.equal(computeDiscountInCents("PERCENT", 10, 6000), 600);
});

test("computeDiscountInCents returns 0 for non-positive base", () => {
  assert.equal(computeDiscountInCents("AMOUNT", 1000, 0), 0);
  assert.equal(computeDiscountInCents("AMOUNT", 1000, -10), 0);
  assert.equal(computeDiscountInCents("PERCENT", 50, 0), 0);
});
