import assert from "node:assert/strict";
import test from "node:test";
import { isReadyForPendingEnd } from "@/lib/sessions/pending-end";

test("not ready when the moodboard hasn't been sent", () => {
  assert.equal(
    isReadyForPendingEnd({
      moodboardsSent: 0,
      moodboardsAllowed: 1,
      styleboardsSent: 3,
      styleboardsAllowed: 3,
      bonusBoardsGranted: 0,
    }),
    false,
  );
});

test("not ready when fewer styleboards than the plan promises", () => {
  assert.equal(
    isReadyForPendingEnd({
      moodboardsSent: 1,
      moodboardsAllowed: 1,
      styleboardsSent: 2,
      styleboardsAllowed: 3,
      bonusBoardsGranted: 0,
    }),
    false,
  );
});

test("ready at exactly the plan's styleboard allowance", () => {
  assert.equal(
    isReadyForPendingEnd({
      moodboardsSent: 1,
      moodboardsAllowed: 1,
      styleboardsSent: 3,
      styleboardsAllowed: 3,
      bonusBoardsGranted: 0,
    }),
    true,
  );
});

test("bonus boards (earned from Revise) extend the required count", () => {
  // stylist got a restyle bonus; must deliver 4 before PENDING_END
  assert.equal(
    isReadyForPendingEnd({
      moodboardsSent: 1,
      moodboardsAllowed: 1,
      styleboardsSent: 3,
      styleboardsAllowed: 3,
      bonusBoardsGranted: 1,
    }),
    false,
  );

  assert.equal(
    isReadyForPendingEnd({
      moodboardsSent: 1,
      moodboardsAllowed: 1,
      styleboardsSent: 4,
      styleboardsAllowed: 3,
      bonusBoardsGranted: 1,
    }),
    true,
  );
});

test("Lux (8 looks) gates correctly", () => {
  assert.equal(
    isReadyForPendingEnd({
      moodboardsSent: 1,
      moodboardsAllowed: 1,
      styleboardsSent: 7,
      styleboardsAllowed: 8,
      bonusBoardsGranted: 0,
    }),
    false,
  );
  assert.equal(
    isReadyForPendingEnd({
      moodboardsSent: 1,
      moodboardsAllowed: 1,
      styleboardsSent: 8,
      styleboardsAllowed: 8,
      bonusBoardsGranted: 0,
    }),
    true,
  );
});
