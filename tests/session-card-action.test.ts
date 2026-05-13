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

test("deriveStatus: terminal statuses short-circuit regardless of unrated boards", () => {
  for (const status of ["COMPLETED", "CANCELLED", "FROZEN", "REASSIGNED"]) {
    const withBoard = base({
      status,
      boards: [{ id: "b1", type: "MOODBOARD" }],
    });
    assert.equal(deriveStatus(withBoard), "terminal", `${status} with board`);

    const empty = base({ status });
    assert.equal(deriveStatus(empty), "terminal", `${status} bare`);
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

test("actionLabel: completed → Book {first} Again", () => {
  assert.equal(actionLabel("completed", base(), "Maya"), "Book Maya Again");
});

test("actionLabel: terminal → Rebook {first}", () => {
  assert.equal(actionLabel("terminal", base(), "Matthew"), "Rebook Matthew");
});

test("actionHref: terminal links to stylist profile when present", () => {
  assert.equal(actionHref("terminal", base()), "/stylists/sp_1");
});

test("actionHref: terminal falls back to /stylists directory when no profile id", () => {
  const noProfile = base({
    stylist: { firstName: "Matthew", stylistProfile: null },
  });
  assert.equal(actionHref("terminal", noProfile), "/stylists");
});

test("actionHref: terminal falls back to /stylists directory when no stylist", () => {
  const noStylist = base({ stylist: null });
  assert.equal(actionHref("terminal", noStylist), "/stylists");
});

test("messagePreview: terminal statuses ignore latest message text", () => {
  for (const [status, expected] of [
    ["COMPLETED", "Session completed."],
    ["CANCELLED", "Session cancelled."],
    ["FROZEN", "Session frozen."],
    ["REASSIGNED", "Session reassigned."],
  ] as const) {
    const s = base({
      status,
      messages: [{ text: "Matthew loved the moodboard.", kind: "TEXT" }],
    });
    assert.equal(messagePreview(s), expected, status);
  }
});

test("actionHref: completed → stylist profile when present, session detail otherwise", () => {
  assert.equal(actionHref("completed", base()), "/stylists/sp_1");
  const noProfile = base({
    stylist: { firstName: "Maya", stylistProfile: null },
  });
  assert.equal(actionHref("completed", noProfile), "/sessions/s_1");
});

test("messagePreview: latest message text wins on non-terminal sessions", () => {
  const s = base({
    messages: [{ text: "Hello there", kind: "TEXT" }],
    status: "ACTIVE",
  });
  assert.equal(messagePreview(s), "Hello there");
});

test("messagePreview: BOOKED + PENDING_END_APPROVAL fallback when no message", () => {
  assert.equal(
    messagePreview(base({ status: "BOOKED" })),
    "Booked — your stylist will reach out shortly.",
  );
  assert.equal(
    messagePreview(base({ status: "PENDING_END_APPROVAL" })),
    "Your stylist requested to wrap up.",
  );
});
