import assert from "node:assert/strict";
import test from "node:test";
import {
  MIN_TIP_CENTS,
  TIP_CHIP_PERCENTAGES,
  computeChipAmounts,
  maxTipCents,
  validateTip,
} from "@/lib/payments/tip-policy";

test("chip percentages are 15/20/25", () => {
  assert.deepEqual(TIP_CHIP_PERCENTAGES, [15, 20, 25]);
});

test("chip amounts for Major ($130) are $19.50 / $26 / $32.50", () => {
  assert.deepEqual(computeChipAmounts(13000), [
    { percentage: 15, amountCents: 1950 },
    { percentage: 20, amountCents: 2600 },
    { percentage: 25, amountCents: 3250 },
  ]);
});

test("chip amounts for Lux ($550) are $82.50 / $110 / $137.50", () => {
  assert.deepEqual(computeChipAmounts(55000), [
    { percentage: 15, amountCents: 8250 },
    { percentage: 20, amountCents: 11000 },
    { percentage: 25, amountCents: 13750 },
  ]);
});

test("chip amounts for Mini ($60) are $9 / $12 / $15", () => {
  assert.deepEqual(computeChipAmounts(6000), [
    { percentage: 15, amountCents: 900 },
    { percentage: 20, amountCents: 1200 },
    { percentage: 25, amountCents: 1500 },
  ]);
});

test("zero tip is valid", () => {
  assert.deepEqual(validateTip(0, 13000), { ok: true, amountCents: 0 });
});

test("below $1 minimum is rejected", () => {
  assert.equal(validateTip(99, 13000).ok, false);
});

test("exactly the minimum is accepted", () => {
  assert.deepEqual(validateTip(MIN_TIP_CENTS, 13000), {
    ok: true,
    amountCents: MIN_TIP_CENTS,
  });
});

test("tip exceeding plan price is rejected", () => {
  assert.equal(validateTip(13001, 13000).ok, false);
});

test("tip equal to plan price is the ceiling", () => {
  assert.deepEqual(validateTip(13000, 13000), { ok: true, amountCents: 13000 });
});

test("non-integer cents rejected", () => {
  assert.equal(validateTip(100.5, 13000).ok, false);
});

test("maxTipCents equals plan price", () => {
  assert.equal(maxTipCents(6000), 6000);
  assert.equal(maxTipCents(13000), 13000);
  assert.equal(maxTipCents(55000), 55000);
});
