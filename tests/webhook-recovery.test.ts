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

test("checkout retries fire the activation pipeline even when a stylist was explicitly selected", () => {
  // matchStylistForSession is now the single activation entry point — it
  // handles auto-match and explicit-stylist activation, opens
  // PENDING_MOODBOARD, sends SESSION_ACTIVATED, creates the chat
  // conversation. Recovery should fire it for any BOOKED session.
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
    shouldAutoMatch: true,
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

test("only BOOKED sessions are eligible for the activation pipeline", () => {
  // Non-BOOKED statuses are not candidates — the activation pipeline is
  // BOOKED → ACTIVE specifically.
  assert.equal(
    shouldAutoMatchRecoveredSession({
      explicitStylistUserId: null,
      session: { status: "ACTIVE", stylistId: null },
    }),
    false,
  );
  assert.equal(
    shouldAutoMatchRecoveredSession({
      explicitStylistUserId: null,
      session: { status: "COMPLETED", stylistId: "stylist_123" },
    }),
    false,
  );

  // BOOKED with explicit stylist is now in scope — matchStylistForSession
  // handles both auto-match and explicit-stylist activation.
  assert.equal(
    shouldAutoMatchRecoveredSession({
      explicitStylistUserId: "stylist_123",
      session: { status: "BOOKED", stylistId: "stylist_123" },
    }),
    true,
  );
  // BOOKED with no stylist also fires (auto-match branch).
  assert.equal(
    shouldAutoMatchRecoveredSession({
      explicitStylistUserId: null,
      session: { status: "BOOKED", stylistId: null },
    }),
    true,
  );
});
