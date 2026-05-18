// Unit tests for the direct-sale fulfillment state machine in
// admin-orders.service. State-machine queries are pure — no DB needed.

import assert from "node:assert/strict";
import test from "node:test";
import {
  nextAllowedStatuses,
  nextAllowedItemStatuses,
  lineRefundCents,
  REFUND_SOFT_CAP_CENTS,
  refundSoftCapWarning,
  UNFULFILLABLE_REASONS,
} from "@/lib/orders/admin-orders.service";

// ─── Order-level state machine (legacy + new universal-fulfillment) ──────

test("nextAllowedStatuses: ORDERED can go to SHIPPED or COMPLETED", () => {
  assert.deepEqual(nextAllowedStatuses("ORDERED"), ["SHIPPED", "COMPLETED"]);
});

test("nextAllowedStatuses: SHIPPED can only go to ARRIVED", () => {
  assert.deepEqual(nextAllowedStatuses("SHIPPED"), ["ARRIVED"]);
});

test("nextAllowedStatuses: ARRIVED can only go to RETURN_IN_PROCESS", () => {
  assert.deepEqual(nextAllowedStatuses("ARRIVED"), ["RETURN_IN_PROCESS"]);
});

test("nextAllowedStatuses: RETURN_IN_PROCESS can only go to RETURNED", () => {
  assert.deepEqual(nextAllowedStatuses("RETURN_IN_PROCESS"), ["RETURNED"]);
});

test("nextAllowedStatuses: RETURNED is terminal", () => {
  assert.deepEqual(nextAllowedStatuses("RETURNED"), []);
});

test("nextAllowedStatuses: COMPLETED is terminal (universal-fulfillment rollup)", () => {
  assert.deepEqual(nextAllowedStatuses("COMPLETED"), []);
});

test("nextAllowedStatuses: PENDING advances to ORDERED", () => {
  assert.deepEqual(nextAllowedStatuses("PENDING"), ["ORDERED"]);
});

// ─── Per-OrderItem state machine ─────────────────────────────────────────

test("nextAllowedItemStatuses: PENDING can go to PURCHASED or UNFULFILLABLE", () => {
  assert.deepEqual(nextAllowedItemStatuses("PENDING"), [
    "PURCHASED",
    "UNFULFILLABLE",
  ]);
});

test("nextAllowedItemStatuses: PURCHASED can only go to RETURN_REQUESTED", () => {
  assert.deepEqual(nextAllowedItemStatuses("PURCHASED"), ["RETURN_REQUESTED"]);
});

test("nextAllowedItemStatuses: RETURN_REQUESTED can only go to RETURNED", () => {
  assert.deepEqual(nextAllowedItemStatuses("RETURN_REQUESTED"), ["RETURNED"]);
});

test("nextAllowedItemStatuses: UNFULFILLABLE is terminal", () => {
  assert.deepEqual(nextAllowedItemStatuses("UNFULFILLABLE"), []);
});

test("nextAllowedItemStatuses: RETURNED is terminal", () => {
  assert.deepEqual(nextAllowedItemStatuses("RETURNED"), []);
});

test("UNFULFILLABLE_REASONS covers the documented set", () => {
  assert.deepEqual([...UNFULFILLABLE_REASONS], [
    "out_of_stock",
    "wont_ship",
    "price_jumped",
    "retailer_issue",
    "other",
  ]);
});

// ─── lineRefundCents math ────────────────────────────────────────────────

test("lineRefundCents: returns 0 for items already refunded", () => {
  const refunded = lineRefundCents(
    { priceInCents: 5000, quantity: 1, refundedInCents: 5000 },
    { totalInCents: 5800, taxInCents: 500, shippingInCents: 300 },
  );
  assert.equal(refunded, 0);
});

test("lineRefundCents: line subtotal + proportional tax (single line)", () => {
  // $100 item, $10 tax, $10 shipping, total $120. One line. Line refund:
  // $100 + 100% of $10 tax = $110. Shipping excluded by default.
  const refunded = lineRefundCents(
    { priceInCents: 10_000, quantity: 1, refundedInCents: 0 },
    { totalInCents: 12_000, taxInCents: 1_000, shippingInCents: 1_000 },
  );
  assert.equal(refunded, 11_000);
});

test("lineRefundCents: proportional tax with 3 equal lines sums to total tax", () => {
  // Three $100 items, $30 tax. Each line gets exactly $10 tax share.
  const order = { totalInCents: 33_000, taxInCents: 3_000, shippingInCents: 0 };
  const line = { priceInCents: 10_000, quantity: 1, refundedInCents: 0 };
  const perLine = lineRefundCents(line, order);
  assert.equal(perLine, 11_000);
  // Sum across all three lines == total order
  assert.equal(perLine * 3, 33_000);
});

test("lineRefundCents: proportional tax with quantity > 1", () => {
  // One line at $50 × 2 = $100 subtotal, with $10 tax, $10 shipping.
  // Tax allocation: 100/100 * 10 = 10. Refund = 100 + 10 = 110.
  const refunded = lineRefundCents(
    { priceInCents: 5_000, quantity: 2, refundedInCents: 0 },
    { totalInCents: 12_000, taxInCents: 1_000, shippingInCents: 1_000 },
  );
  assert.equal(refunded, 11_000);
});

test("lineRefundCents: zero subtotal returns just line price (no divide by zero)", () => {
  // Pathological: order with no subtotal somehow. Tax share = 0.
  const refunded = lineRefundCents(
    { priceInCents: 1_000, quantity: 1, refundedInCents: 0 },
    { totalInCents: 1_000, taxInCents: 0, shippingInCents: 0 },
  );
  assert.equal(refunded, 1_000);
});

test("lineRefundCents: includeShipping=true adds full shipping", () => {
  // All-unfulfillable rollup path: refund the full shipping with the line.
  const refunded = lineRefundCents(
    { priceInCents: 10_000, quantity: 1, refundedInCents: 0 },
    { totalInCents: 12_000, taxInCents: 1_000, shippingInCents: 1_000 },
    { includeShipping: true },
  );
  assert.equal(refunded, 12_000);
});

// ─── Refund soft cap ─────────────────────────────────────────────────────

test("REFUND_SOFT_CAP_CENTS is $200", () => {
  assert.equal(REFUND_SOFT_CAP_CENTS, 20_000);
});

test("refundSoftCapWarning: below cap returns null", () => {
  assert.equal(refundSoftCapWarning(19_900), null);
  assert.equal(refundSoftCapWarning(20_000), null); // at cap is OK
});

test("refundSoftCapWarning: above cap returns a warning mentioning $200", () => {
  const warn = refundSoftCapWarning(20_001);
  assert.ok(warn);
  assert.ok(warn.includes("$200"));
  assert.ok(warn.toLowerCase().includes("manager"));
});
