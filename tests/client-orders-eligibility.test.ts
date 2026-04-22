// Unit tests for return eligibility. Pure function — no DB.

import assert from "node:assert/strict";
import test from "node:test";
import {
  isReturnEligible,
  RETURN_WINDOW_DAYS,
} from "@/lib/orders/client-orders.service";

const NOW = new Date("2026-04-22T12:00:00Z");

test("isReturnEligible: ARRIVED direct-sale within window → true", () => {
  const arrivedAt = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000);
  assert.equal(
    isReturnEligible(
      { source: "DIRECT_SALE", status: "ARRIVED", arrivedAt },
      NOW,
    ),
    true,
  );
});

test("isReturnEligible: ARRIVED direct-sale at exact window edge → true", () => {
  const arrivedAt = new Date(NOW.getTime() - RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  assert.equal(
    isReturnEligible(
      { source: "DIRECT_SALE", status: "ARRIVED", arrivedAt },
      NOW,
    ),
    true,
  );
});

test("isReturnEligible: ARRIVED direct-sale just past window → false", () => {
  const arrivedAt = new Date(
    NOW.getTime() - (RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000 + 1),
  );
  assert.equal(
    isReturnEligible(
      { source: "DIRECT_SALE", status: "ARRIVED", arrivedAt },
      NOW,
    ),
    false,
  );
});

test("isReturnEligible: affiliate source → false even when ARRIVED", () => {
  const arrivedAt = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
  assert.equal(
    isReturnEligible(
      { source: "AFFILIATE_CONFIRMED", status: "ARRIVED", arrivedAt },
      NOW,
    ),
    false,
  );
  assert.equal(
    isReturnEligible(
      { source: "SELF_REPORTED", status: "ARRIVED", arrivedAt },
      NOW,
    ),
    false,
  );
});

test("isReturnEligible: ORDERED status → false (not yet delivered)", () => {
  assert.equal(
    isReturnEligible(
      {
        source: "DIRECT_SALE",
        status: "ORDERED",
        arrivedAt: null,
      },
      NOW,
    ),
    false,
  );
});

test("isReturnEligible: already RETURN_IN_PROCESS → false (idempotent block)", () => {
  const arrivedAt = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
  assert.equal(
    isReturnEligible(
      { source: "DIRECT_SALE", status: "RETURN_IN_PROCESS", arrivedAt },
      NOW,
    ),
    false,
  );
});

test("isReturnEligible: RETURNED → false", () => {
  const arrivedAt = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
  assert.equal(
    isReturnEligible(
      { source: "DIRECT_SALE", status: "RETURNED", arrivedAt },
      NOW,
    ),
    false,
  );
});

test("isReturnEligible: arrivedAt null → false (defensive)", () => {
  assert.equal(
    isReturnEligible(
      { source: "DIRECT_SALE", status: "ARRIVED", arrivedAt: null },
      NOW,
    ),
    false,
  );
});
