// Adapter unit tests for the stylist dashboard view-model.
//
// Pins the new `deriveDashboardAction` vocabulary that replaced the
// Loveable-mirrored `actionLabelFor`. Every label returned by the new
// function must navigate to a real destination — the previous Loveable
// vocabulary left "Start styling" / "View session" / "Awaiting approval"
// as no-op selectors in production once real PendingAction states started
// flowing in. The matrix below is the contract: state → label → href.
import assert from "node:assert/strict";
import test from "node:test";

import { deriveDashboardAction } from "@/lib/sessions/stylist-dashboard";
import {
  comfortZoneLabel,
  extractHandle,
  mapLoyalty,
  splitToChips,
} from "@/lib/stylists/client-profile";

function ctx(overrides: Partial<Parameters<typeof deriveDashboardAction>[0]> = {}) {
  return {
    sessionId: "sess_test",
    status: "ACTIVE" as const,
    moodboardsSent: 1,
    styleboardsSent: 1,
    styleboardsAllowed: 5,
    endRequestedAt: null,
    pendingActionType: null,
    pendingRestyleParentBoardId: null,
    ...overrides,
  };
}

test("Create Moodboard fires when no moodboard has been sent", () => {
  const action = deriveDashboardAction(
    ctx({ moodboardsSent: 0, status: "BOOKED" }),
  );
  assert.equal(action.label, "Create Moodboard");
  assert.equal(action.href, "/stylist/sessions/sess_test/moodboards/new");
  assert.equal(action.kind, "navigate");
});

test("Create Look fires when moodboard is in but quota remains", () => {
  const action = deriveDashboardAction(
    ctx({ moodboardsSent: 1, styleboardsSent: 2, styleboardsAllowed: 5 }),
  );
  assert.equal(action.label, "Create Look");
  assert.equal(action.href, "/stylist/sessions/sess_test/styleboards/new");
});

test("Review Restyle pre-fills parentBoardId when PENDING_RESTYLE is open", () => {
  const action = deriveDashboardAction(
    ctx({
      pendingActionType: "PENDING_RESTYLE",
      pendingRestyleParentBoardId: "board_abc",
    }),
  );
  assert.equal(action.label, "Review Restyle");
  assert.equal(
    action.href,
    "/stylist/sessions/sess_test/styleboards/new?parentBoardId=board_abc",
  );
  assert.equal(action.kind, "navigate");
});

test("Review Restyle falls back to Create Look when boardId is missing", () => {
  // PENDING_RESTYLE rows without a boardId would otherwise produce a broken
  // ?parentBoardId= URL — degrade to plain Create Look so the stylist still
  // gets a working button.
  const action = deriveDashboardAction(
    ctx({
      pendingActionType: "PENDING_RESTYLE",
      pendingRestyleParentBoardId: null,
    }),
  );
  assert.equal(action.label, "Create Look");
  assert.equal(action.href, "/stylist/sessions/sess_test/styleboards/new");
});

test("Awaiting Client surfaces when stylist requested end approval", () => {
  const action = deriveDashboardAction(
    ctx({
      endRequestedAt: new Date(),
      status: "PENDING_END_APPROVAL",
    }),
  );
  assert.equal(action.label, "Awaiting Client");
  assert.equal(action.href, "/stylist/dashboard?session=sess_test");
  // Only the client can approve — the stylist's CTA just opens the chat where
  // the awaiting-approval badge is visible.
  assert.equal(action.kind, "navigate");
});

test("Awaiting Client wins over Create Moodboard when both signals are present", () => {
  // Edge case: hypothetical session where the stylist requested end before
  // sending the first moodboard. The end-request resolution is the unblocking
  // step; Create Moodboard would be useless until the client decides.
  const action = deriveDashboardAction(
    ctx({
      moodboardsSent: 0,
      endRequestedAt: new Date(),
      status: "PENDING_END_APPROVAL",
    }),
  );
  assert.equal(action.label, "Awaiting Client");
  assert.equal(action.kind, "navigate");
});

test("View Summary fires for COMPLETED sessions", () => {
  const action = deriveDashboardAction(ctx({ status: "COMPLETED" }));
  assert.equal(action.label, "View Summary");
  assert.equal(action.href, "/stylist/dashboard?session=sess_test");
  assert.equal(action.kind, "navigate");
});

test("View Summary fires for CANCELLED sessions", () => {
  const action = deriveDashboardAction(ctx({ status: "CANCELLED" }));
  assert.equal(action.label, "View Summary");
});

test("View Summary wins over the in-progress derivations once status is terminal", () => {
  // Even with looks remaining, a COMPLETED session should not show
  // "Create Look" — the chat is read-only.
  const action = deriveDashboardAction(
    ctx({ status: "COMPLETED", styleboardsSent: 1, styleboardsAllowed: 5 }),
  );
  assert.equal(action.label, "View Summary");
});

test("Open Chat fires when looks are at quota and session is awaiting client", () => {
  const action = deriveDashboardAction(
    ctx({ moodboardsSent: 1, styleboardsSent: 5, styleboardsAllowed: 5 }),
  );
  assert.equal(action.label, "Open Chat");
  assert.equal(action.href, "/stylist/dashboard?session=sess_test");
  assert.equal(action.kind, "navigate");
});

test("Every label routes to a real destination — no no-op buttons", () => {
  // Sweep representative states; assert no empty href, no "Start styling",
  // no "View session" (lowercase), none of the dead Loveable vocabulary.
  const sweep = [
    ctx({ moodboardsSent: 0 }),
    ctx({ moodboardsSent: 1, styleboardsSent: 0 }),
    ctx({
      pendingActionType: "PENDING_RESTYLE",
      pendingRestyleParentBoardId: "b1",
    }),
    ctx({ endRequestedAt: new Date(), status: "PENDING_END_APPROVAL" }),
    ctx({ status: "COMPLETED" }),
    ctx({ status: "CANCELLED" }),
    ctx({ moodboardsSent: 1, styleboardsSent: 5, styleboardsAllowed: 5 }),
  ];
  const dead = new Set([
    "Start styling",
    "View session",
    "Awaiting approval",
    "Review Restyle Request",
    "View summary",
  ]);
  for (const c of sweep) {
    const action = deriveDashboardAction(c);
    assert.ok(action.href.length > 0, `empty href for ${JSON.stringify(c)}`);
    assert.ok(
      !dead.has(action.label),
      `${action.label} is from the deprecated vocabulary`,
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

test("comfortZoneLabel resolves Loveable enum first, falls back to legacy Int", () => {
  // Empty when neither input is set
  assert.equal(comfortZoneLabel(null), "");
  // Loveable enum (new) — 3 buckets, exact mapping
  assert.equal(comfortZoneLabel("STAY_CLOSE"), "Stay close");
  assert.equal(comfortZoneLabel("FEW_NEW_ITEMS"), "A little outside");
  assert.equal(comfortZoneLabel("NEW_STYLE"), "Push my boundaries");
  // Enum wins over legacy Int
  assert.equal(comfortZoneLabel("STAY_CLOSE", 10), "Stay close");
  // Falls back to legacy Int when enum is null
  assert.equal(comfortZoneLabel(null, 1), "Stay close");
  assert.equal(comfortZoneLabel(null, 3), "Stay close");
  assert.equal(comfortZoneLabel(null, 4), "A little outside");
  assert.equal(comfortZoneLabel(null, 7), "A little outside");
  assert.equal(comfortZoneLabel(null, 8), "Push my boundaries");
  assert.equal(comfortZoneLabel(null, 10), "Push my boundaries");
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
