import assert from "node:assert/strict";
import test from "node:test";
import {
  completionTriggerFor,
  computePayoutAmount,
  isLuxPlan,
} from "@/lib/payouts/policy";

const MAJOR = {
  priceInCents: 13000,
  payoutTrigger: "SESSION_COMPLETED" as const,
  luxMilestoneAmountCents: null,
  luxMilestoneLookNumber: null,
};

const MINI = {
  priceInCents: 6000,
  payoutTrigger: "SESSION_COMPLETED" as const,
  luxMilestoneAmountCents: null,
  luxMilestoneLookNumber: null,
};

const LUX = {
  priceInCents: 55000,
  payoutTrigger: "LUX_THIRD_LOOK" as const,
  luxMilestoneAmountCents: 13500,
  luxMilestoneLookNumber: 3,
};

const STYLIST = { payoutPercentage: 70 };

test("Major SESSION_COMPLETED with $26 tip: 70% of $130 + $26 = $117", () => {
  const r = computePayoutAmount({
    plan: MAJOR,
    session: { tipInCents: 2600 },
    stylist: STYLIST,
    trigger: "SESSION_COMPLETED",
  });
  // 0.70 * 13000 = 9100; + 2600 tip = 11700
  assert.equal(r.amountCents, 11700);
  assert.equal(r.tipCents, 2600);
});

test("Mini SESSION_COMPLETED with no tip: 70% of $60 = $42", () => {
  const r = computePayoutAmount({
    plan: MINI,
    session: { tipInCents: 0 },
    stylist: STYLIST,
    trigger: "SESSION_COMPLETED",
  });
  assert.equal(r.amountCents, 4200);
  assert.equal(r.tipCents, 0);
});

test("Lux LUX_THIRD_LOOK pays the milestone amount only, no tip", () => {
  const r = computePayoutAmount({
    plan: LUX,
    session: { tipInCents: 11000 }, // tip should be ignored here
    stylist: STYLIST,
    trigger: "LUX_THIRD_LOOK",
  });
  assert.equal(r.amountCents, 13500);
  assert.equal(r.tipCents, 0);
});

test("Lux LUX_FINAL with $110 tip: (70% × $550) - $135 milestone + $110 = $36,500", () => {
  const r = computePayoutAmount({
    plan: LUX,
    session: { tipInCents: 11000 },
    stylist: STYLIST,
    trigger: "LUX_FINAL",
  });
  // 0.70 * 55000 = 38500; - 13500 = 25000; + 11000 tip = 36000
  assert.equal(r.amountCents, 36000);
  assert.equal(r.tipCents, 11000);
});

test("Lux LUX_FINAL with no tip: 70% - milestone", () => {
  const r = computePayoutAmount({
    plan: LUX,
    session: { tipInCents: 0 },
    stylist: STYLIST,
    trigger: "LUX_FINAL",
  });
  assert.equal(r.amountCents, 25000); // 38500 - 13500
  assert.equal(r.tipCents, 0);
});

test("Different payoutPercentage scales linearly", () => {
  const r = computePayoutAmount({
    plan: MAJOR,
    session: { tipInCents: 0 },
    stylist: { payoutPercentage: 50 },
    trigger: "SESSION_COMPLETED",
  });
  assert.equal(r.amountCents, 6500); // 0.50 * 13000
});

test("completionTriggerFor: Mini/Major → SESSION_COMPLETED, Lux → LUX_FINAL", () => {
  assert.equal(completionTriggerFor(MINI), "SESSION_COMPLETED");
  assert.equal(completionTriggerFor(MAJOR), "SESSION_COMPLETED");
  assert.equal(completionTriggerFor(LUX), "LUX_FINAL");
});

test("isLuxPlan flag", () => {
  assert.equal(isLuxPlan(MINI), false);
  assert.equal(isLuxPlan(MAJOR), false);
  assert.equal(isLuxPlan(LUX), true);
});
