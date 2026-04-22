// Unit tests for the direct-sale fulfillment state machine in
// admin-orders.service. nextAllowedStatuses is pure — no DB needed.

import assert from "node:assert/strict";
import test from "node:test";
import { nextAllowedStatuses, REFUND_SOFT_CAP_CENTS } from "@/lib/orders/admin-orders.service";

test("nextAllowedStatuses: ORDERED can only go to SHIPPED", () => {
  assert.deepEqual(nextAllowedStatuses("ORDERED"), ["SHIPPED"]);
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

test("nextAllowedStatuses: PENDING advances to ORDERED (affiliate→direct-sale migration)", () => {
  assert.deepEqual(nextAllowedStatuses("PENDING"), ["ORDERED"]);
});

test("REFUND_SOFT_CAP_CENTS is $200", () => {
  assert.equal(REFUND_SOFT_CAP_CENTS, 20_000);
});
