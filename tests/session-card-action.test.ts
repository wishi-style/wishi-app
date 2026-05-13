import assert from "node:assert/strict";
import test from "node:test";
import {
  actionHref,
  actionLabel,
  deriveStatus,
  messagePreview,
  type SessionCardInput,
} from "@/lib/sessions/session-card-action";

function base(overrides: Partial<SessionCardInput> = {}): SessionCardInput {
  return {
    id: "s_1",
    status: "ACTIVE",
    stylist: {
      firstName: "Maya",
      stylistProfile: { id: "sp_1" },
    },
    messages: [],
    boards: [],
    ...overrides,
  };
}

test("deriveStatus: unrated board wins over ACTIVE status", () => {
  const s = base({
    boards: [{ id: "b1", type: "STYLEBOARD" }],
  });
  assert.equal(deriveStatus(s), "new_board");
});

test("deriveStatus: PENDING_END_APPROVAL routes to awaiting_reply", () => {
  assert.equal(deriveStatus(base({ status: "PENDING_END_APPROVAL" })), "awaiting_reply");
});

test("deriveStatus: BOOKED routes to booked", () => {
  assert.equal(deriveStatus(base({ status: "BOOKED" })), "booked");
});

test("deriveStatus: ACTIVE / PENDING_END / END_DECLINED route to in_progress", () => {
  for (const status of ["ACTIVE", "PENDING_END", "END_DECLINED"]) {
    assert.equal(deriveStatus(base({ status })), "in_progress", status);
  }
});

test("deriveStatus: COMPLETED routes to completed", () => {
  assert.equal(deriveStatus(base({ status: "COMPLETED" })), "completed");
});

test("deriveStatus: CANCELLED / FROZEN / REASSIGNED route to closed", () => {
  for (const status of ["CANCELLED", "FROZEN", "REASSIGNED"]) {
    assert.equal(deriveStatus(base({ status })), "closed", status);
  }
});

test("actionLabel: new_board label varies by board kind", () => {
  const s = base({ boards: [{ id: "b1", type: "MOODBOARD" }] });
  assert.equal(actionLabel("new_board", s, "Maya"), "Review Moodboard");

  const sb = base({ boards: [{ id: "b1", type: "STYLEBOARD" }] });
  assert.equal(actionLabel("new_board", sb, "Maya"), "Review Styleboard");

  const restyle = base({
    boards: [{ id: "b1", type: "STYLEBOARD", isRevision: true }],
  });
  assert.equal(actionLabel("new_board", restyle, "Maya"), "Review Revised Look");
});

test("actionLabel: completed → Book {first} Again (will change in next task)", () => {
  assert.equal(actionLabel("completed", base(), "Maya"), "Book Maya Again");
});

test("actionLabel: closed → View Details (will change in next task)", () => {
  assert.equal(actionLabel("closed", base(), "Maya"), "View Details");
});

test("actionHref: completed → stylist profile when present, session detail otherwise", () => {
  assert.equal(actionHref("completed", base()), "/stylists/sp_1");
  const noProfile = base({
    stylist: { firstName: "Maya", stylistProfile: null },
  });
  assert.equal(actionHref("completed", noProfile), "/sessions/s_1");
});

test("messagePreview: latest message text wins", () => {
  const s = base({
    messages: [{ text: "Hello there", kind: "TEXT" }],
    status: "CANCELLED",
  });
  assert.equal(messagePreview(s), "Hello there");
});

test("messagePreview: status fallback for COMPLETED / CANCELLED / FROZEN / REASSIGNED", () => {
  assert.equal(messagePreview(base({ status: "COMPLETED" })), "Session completed.");
  assert.equal(messagePreview(base({ status: "CANCELLED" })), "Session cancelled.");
  assert.equal(messagePreview(base({ status: "FROZEN" })), "Session paused.");
  assert.equal(
    messagePreview(base({ status: "REASSIGNED" })),
    "Reassigned to another stylist.",
  );
});
