import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCheckoutRecoveryPlan,
  buildSessionRecoveryPlan,
  shouldAutoMatchRecoveredSession,
} from "@/lib/payments/webhook-recovery";

test("checkout retries still backfill the payment and rerun auto-match", () => {
  const plan = buildCheckoutRecoveryPlan({
    existingSession: {
      status: "BOOKED",
      stylistId: null,
    },
    hasPayment: false,
    explicitStylistUserId: null,
  });

  assert.deepEqual(plan, {
    shouldCreateSession: false,
    shouldCreatePayment: true,
    shouldAutoMatch: true,
  });
});

test("checkout retries do not auto-match when a stylist was explicitly selected", () => {
  const plan = buildCheckoutRecoveryPlan({
    existingSession: {
      status: "BOOKED",
      stylistId: "stylist_123",
    },
    hasPayment: false,
    explicitStylistUserId: "stylist_123",
  });

  assert.deepEqual(plan, {
    shouldCreateSession: false,
    shouldCreatePayment: true,
    shouldAutoMatch: false,
  });
});

test("subscription and renewal retries reuse an existing unmatched booked session", () => {
  const plan = buildSessionRecoveryPlan({
    existingSession: {
      status: "BOOKED",
      stylistId: null,
    },
    explicitStylistUserId: null,
  });

  assert.deepEqual(plan, {
    shouldCreateSession: false,
    shouldAutoMatch: true,
  });
});

test("only unmatched booked sessions are eligible for retry matching", () => {
  assert.equal(
    shouldAutoMatchRecoveredSession({
      explicitStylistUserId: null,
      session: { status: "ACTIVE", stylistId: null },
    }),
    false
  );

  assert.equal(
    shouldAutoMatchRecoveredSession({
      explicitStylistUserId: null,
      session: { status: "BOOKED", stylistId: "stylist_123" },
    }),
    false
  );
});
