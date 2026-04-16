import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_DUE_OFFSETS_MS,
  defaultDueAt,
} from "@/lib/pending-actions/policy";

const HOUR_MS = 60 * 60 * 1000;

test("PENDING_MOODBOARD default is 24h", () => {
  assert.equal(DEFAULT_DUE_OFFSETS_MS.PENDING_MOODBOARD, 24 * HOUR_MS);
});

test("PENDING_CLIENT_FEEDBACK default is 72h", () => {
  assert.equal(DEFAULT_DUE_OFFSETS_MS.PENDING_CLIENT_FEEDBACK, 72 * HOUR_MS);
});

test("PENDING_STYLIST_RESPONSE default is 6h", () => {
  assert.equal(DEFAULT_DUE_OFFSETS_MS.PENDING_STYLIST_RESPONSE, 6 * HOUR_MS);
});

test("PENDING_END_APPROVAL default is 72h", () => {
  assert.equal(DEFAULT_DUE_OFFSETS_MS.PENDING_END_APPROVAL, 72 * HOUR_MS);
});

test("defaultDueAt adds offset to the provided anchor", () => {
  const anchor = new Date("2026-04-16T00:00:00Z");
  const due = defaultDueAt("PENDING_MOODBOARD", anchor);
  assert.equal(due.getTime() - anchor.getTime(), 24 * HOUR_MS);
});

test("every PendingActionType has a defined offset", () => {
  const types = [
    "PENDING_MOODBOARD",
    "PENDING_STYLEBOARD",
    "PENDING_CLIENT_FEEDBACK",
    "PENDING_RESTYLE",
    "PENDING_STYLIST_RESPONSE",
    "PENDING_FOLLOWUP",
    "PENDING_END_APPROVAL",
  ] as const;
  for (const t of types) {
    assert.ok(
      DEFAULT_DUE_OFFSETS_MS[t] > 0,
      `missing positive offset for ${t}`,
    );
  }
});
