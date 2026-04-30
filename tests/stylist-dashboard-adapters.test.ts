// Adapter parity tests for the stylist dashboard view-model. These mappers
// produce the literal strings + tiers Loveable's UI consumes; passes 1+2 of
// the parity sweep failed because nothing pinned the vocabulary against the
// Loveable mock data shape.
//
// Loveable references:
//   wishi-reimagined/src/pages/StylistDashboard.tsx mockSessions actionLabel
//   wishi-reimagined/src/data/clientProfiles.ts ClientProfile shape
import assert from "node:assert/strict";
import test from "node:test";

import { actionLabelFor } from "@/lib/sessions/stylist-dashboard";
import {
  comfortZoneLabel,
  extractHandle,
  mapLoyalty,
  splitToChips,
} from "@/lib/stylists/client-profile";

test("actionLabelFor maps board states to Loveable's vocabulary", () => {
  assert.equal(actionLabelFor("PENDING_MOODBOARD"), "Create Moodboard");
  assert.equal(actionLabelFor("PENDING_STYLEBOARD"), "Create Look");
  assert.equal(actionLabelFor("PENDING_RESTYLE"), "Review Restyle Request");
});

test("actionLabelFor returns 'View session' (lowercase) for awaiting-feedback states", () => {
  for (const t of [
    "PENDING_STYLIST_RESPONSE",
    "PENDING_CLIENT_FEEDBACK",
    "PENDING_FOLLOWUP",
  ] as const) {
    assert.equal(
      actionLabelFor(t),
      "View session",
      `${t} must map to "View session" (lowercase s) per Loveable mockSessions`,
    );
  }
});

test("actionLabelFor returns 'Awaiting approval' for pending end approval", () => {
  assert.equal(actionLabelFor("PENDING_END_APPROVAL"), "Awaiting approval");
});

test("actionLabelFor falls through to 'Start styling' for new bookings", () => {
  assert.equal(actionLabelFor(null), "Start styling");
});

test("actionLabelFor never returns the literal 'View Session' (Pass 1+2 regression)", () => {
  // Pass 1+2 collapsed every non-board state to "View Session" (capital S),
  // which forced the dashboard click handler to navigate to a phantom
  // /workspace page. Loveable has no such label and no such page.
  const types = [
    null,
    "PENDING_MOODBOARD",
    "PENDING_STYLEBOARD",
    "PENDING_RESTYLE",
    "PENDING_STYLIST_RESPONSE",
    "PENDING_CLIENT_FEEDBACK",
    "PENDING_FOLLOWUP",
    "PENDING_END_APPROVAL",
  ] as const;
  for (const t of types) {
    assert.notEqual(
      actionLabelFor(t),
      "View Session",
      `actionLabelFor(${t}) must not return "View Session" (capital S)`,
    );
  }
});

test("mapLoyalty mirrors the project loyalty thresholds without synthetic silver", () => {
  assert.equal(mapLoyalty("BRONZE", 0), "new");
  assert.equal(mapLoyalty("BRONZE", 1), "bronze");
  assert.equal(mapLoyalty("BRONZE", 2), "bronze"); // Pass 2 returned "silver" here
  assert.equal(mapLoyalty("GOLD", 3), "gold");
  assert.equal(mapLoyalty("GOLD", 7), "gold");
  assert.equal(mapLoyalty("PLATINUM", 8), "vip");
  assert.equal(mapLoyalty(null, 0), "new");
});

test("splitToChips handles single-value, multi-value, and null entries", () => {
  assert.deepEqual(splitToChips(null), []);
  assert.deepEqual(splitToChips(""), []);
  assert.deepEqual(splitToChips("Skinny"), ["Skinny"]);
  assert.deepEqual(splitToChips("Straight, Wide Leg"), ["Straight", "Wide Leg"]);
  assert.deepEqual(splitToChips("Skinny;Flare"), ["Skinny", "Flare"]);
  assert.deepEqual(splitToChips("Gold\nMixed metals"), ["Gold", "Mixed metals"]);
});

test("comfortZoneLabel buckets quiz Int (1–10) into Loveable phrase vocabulary", () => {
  assert.equal(comfortZoneLabel(null), "");
  assert.equal(comfortZoneLabel(1), "Stay close");
  assert.equal(comfortZoneLabel(3), "Stay close");
  assert.equal(comfortZoneLabel(4), "A little outside");
  assert.equal(comfortZoneLabel(7), "A little outside");
  assert.equal(comfortZoneLabel(8), "Push my boundaries");
  assert.equal(comfortZoneLabel(10), "Push my boundaries");
});

test("extractHandle pulls the trailing path segment from a URL", () => {
  assert.equal(extractHandle("https://instagram.com/feizhen.style", "@"), "@feizhen.style");
  assert.equal(extractHandle("https://www.instagram.com/feizhen.style/", "@"), "@feizhen.style");
  assert.equal(extractHandle("instagram.com/feizhen.style", "@"), "@feizhen.style");
});

test("extractHandle preserves handles already in @-prefixed form", () => {
  assert.equal(extractHandle("@feizhen.style", "@"), "@feizhen.style");
});

test("extractHandle returns bare handles for pinterest/facebook (no @ prefix)", () => {
  assert.equal(extractHandle("https://pinterest.com/feizhen_d", ""), "feizhen_d");
  assert.equal(extractHandle("feizhen_d", ""), "feizhen_d");
});

test("extractHandle returns empty string for empty input", () => {
  assert.equal(extractHandle("", "@"), "");
  assert.equal(extractHandle("", ""), "");
});
