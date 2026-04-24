import assert from "node:assert/strict";
import test from "node:test";
import { boardMessageHref } from "@/components/chat/board-href";

const SESSION = "sess_123";
const BOARD = "board_abc";

test("styleboard routes to the client viewer for CLIENT viewers", () => {
  assert.equal(
    boardMessageHref({
      kind: "STYLEBOARD",
      sessionId: SESSION,
      boardId: BOARD,
      viewerRole: "CLIENT",
    }),
    `/sessions/${SESSION}/styleboards/${BOARD}`,
  );
});

test("styleboard routes to the stylist viewer for STYLIST viewers", () => {
  assert.equal(
    boardMessageHref({
      kind: "STYLEBOARD",
      sessionId: SESSION,
      boardId: BOARD,
      viewerRole: "STYLIST",
    }),
    `/stylist/sessions/${SESSION}/styleboards/${BOARD}`,
  );
});

test("moodboard routes to the client viewer for CLIENT viewers", () => {
  assert.equal(
    boardMessageHref({
      kind: "MOODBOARD",
      sessionId: SESSION,
      boardId: BOARD,
      viewerRole: "CLIENT",
    }),
    `/sessions/${SESSION}/moodboards/${BOARD}`,
  );
});

test("moodboard routes to the stylist viewer for STYLIST viewers", () => {
  assert.equal(
    boardMessageHref({
      kind: "MOODBOARD",
      sessionId: SESSION,
      boardId: BOARD,
      viewerRole: "STYLIST",
    }),
    `/stylist/sessions/${SESSION}/moodboards/${BOARD}`,
  );
});

test("restyle routes like a styleboard for CLIENT viewers", () => {
  assert.equal(
    boardMessageHref({
      kind: "RESTYLE",
      sessionId: SESSION,
      boardId: BOARD,
      viewerRole: "CLIENT",
    }),
    `/sessions/${SESSION}/styleboards/${BOARD}`,
  );
});

test("restyle routes like a styleboard for STYLIST viewers", () => {
  assert.equal(
    boardMessageHref({
      kind: "RESTYLE",
      sessionId: SESSION,
      boardId: BOARD,
      viewerRole: "STYLIST",
    }),
    `/stylist/sessions/${SESSION}/styleboards/${BOARD}`,
  );
});

test("null boardId yields null href regardless of kind/role", () => {
  for (const kind of ["MOODBOARD", "STYLEBOARD", "RESTYLE"] as const) {
    for (const viewerRole of ["CLIENT", "STYLIST"] as const) {
      assert.equal(
        boardMessageHref({ kind, sessionId: SESSION, boardId: null, viewerRole }),
        null,
      );
    }
  }
});
