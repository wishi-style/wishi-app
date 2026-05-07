import { expect, test, type Browser } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { getPool } from "./db";
import {
  openDualContexts,
  setupLinkedSession,
} from "./fixtures/journey";

/**
 * Session Room — Inline Card Parity
 *
 * Locks in the Loveable parity contract for the chat session room:
 *
 *  1. /sessions/[id] is a thin redirect to /sessions/[id]/chat (no detail
 *     gate page). Cancelled sessions punt to /sessions.
 *  2. /sessions/[id]/moodboards/[boardId] and /styleboards/[boardId] no
 *     longer exist — they were friction surfaces before this PR.
 *  3. Boards render as inline cards INSIDE the chat stream, not as system
 *     stage bubbles or route-out links.
 *  4. The moodboard card flips state in place after the client submits
 *     feedback: "Reviewed" chip appears + button label flips to
 *     "View My Feedback".
 *  5. No "shared a moodboard with you" / "loved the moodboard" stage
 *     bubbles get dispatched to the chat stream — the card update IS
 *     the signal.
 *
 * Data assertions only; full UI rendering of the MoodBoardWizard +
 * RestyleWizard modals is an OS-rendering concern Playwright can drive
 * later. The data path is the gating contract.
 */

const pool = getPool();

async function seedMoodboardPhoto(boardId: string): Promise<void> {
  await pool.query(
    `INSERT INTO board_photos (id, board_id, s3_key, url, order_index, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 0, NOW(), NOW())`,
    [
      randomUUID(),
      boardId,
      `inline-spec/${boardId}.png`,
      "https://placehold.co/400x400/aaa/png",
    ],
  );
}

test("/sessions/[id] redirects directly to /chat for active sessions", async ({
  browser,
}: { browser: Browser }) => {
  const ctx = await setupLinkedSession({
    prefix: `room-redir-${Date.now().toString(36)}`,
    planType: "MINI",
    sessionStatus: "ACTIVE",
  });
  const dual = await openDualContexts(browser, ctx);
  try {
    const resp = await dual.clientPage.goto(`/sessions/${ctx.session.id}`);
    expect(resp?.ok()).toBeTruthy();
    expect(dual.clientPage.url()).toMatch(
      new RegExp(`/sessions/${ctx.session.id}/chat$`),
    );
  } finally {
    await dual.cleanup();
    await ctx.cleanup();
  }
});

test("/sessions/[id]/moodboards/[boardId] route is gone (404)", async ({
  browser,
}: { browser: Browser }) => {
  const ctx = await setupLinkedSession({
    prefix: `room-404m-${Date.now().toString(36)}`,
    planType: "MINI",
    sessionStatus: "ACTIVE",
  });
  const dual = await openDualContexts(browser, ctx);
  try {
    const fakeBoardId = "fake_board_id";
    const resp = await dual.clientPage.goto(
      `/sessions/${ctx.session.id}/moodboards/${fakeBoardId}`,
    );
    expect(resp?.status()).toBe(404);
  } finally {
    await dual.cleanup();
    await ctx.cleanup();
  }
});

test("/sessions/[id]/styleboards/[boardId] route is gone (404)", async ({
  browser,
}: { browser: Browser }) => {
  const ctx = await setupLinkedSession({
    prefix: `room-404s-${Date.now().toString(36)}`,
    planType: "MINI",
    sessionStatus: "ACTIVE",
  });
  const dual = await openDualContexts(browser, ctx);
  try {
    const fakeBoardId = "fake_board_id";
    const resp = await dual.clientPage.goto(
      `/sessions/${ctx.session.id}/styleboards/${fakeBoardId}`,
    );
    expect(resp?.status()).toBe(404);
  } finally {
    await dual.cleanup();
    await ctx.cleanup();
  }
});

test("moodboard send dispatches no MOODBOARD_DELIVERED stage bubble", async ({
  browser,
}: { browser: Browser }) => {
  const ctx = await setupLinkedSession({
    prefix: `room-no-stage-${Date.now().toString(36)}`,
    planType: "MINI",
    sessionStatus: "ACTIVE",
  });
  const dual = await openDualContexts(browser, ctx);
  try {
    // Stylist creates + sends moodboard via the API (UI exercise lives in
    // journey-j2; this spec gates on the chat-stream contract).
    const mbRes = await dual.stylistPage.request.post("/api/moodboards", {
      data: { sessionId: ctx.session.id },
    });
    expect(mbRes.status()).toBe(201);
    const mb = await mbRes.json();
    await seedMoodboardPhoto(mb.id);
    const send = await dual.stylistPage.request.post(
      `/api/moodboards/${mb.id}/send`,
    );
    expect(send.status()).toBe(200);

    // Pull persisted Message rows for the session — there should be exactly
    // one MOODBOARD-kind row (the card itself) and zero SYSTEM_AUTOMATED
    // rows mentioning "shared a moodboard". The card IS the signal.
    const { rows } = await pool.query<{
      kind: string;
      body: string | null;
    }>(
      `SELECT kind, body FROM messages WHERE session_id = $1 ORDER BY created_at ASC`,
      [ctx.session.id],
    );
    const moodboardCards = rows.filter((r) => r.kind === "MOODBOARD");
    expect(moodboardCards).toHaveLength(1);

    const stageBubbles = rows.filter(
      (r) =>
        r.kind === "SYSTEM_AUTOMATED" &&
        (r.body ?? "").toLowerCase().includes("shared a moodboard"),
    );
    expect(stageBubbles).toHaveLength(0);
  } finally {
    await dual.cleanup();
    await ctx.cleanup();
  }
});

test("moodboard rating dispatches no FEEDBACK_MOODBOARD_LOVE stage bubble", async ({
  browser,
}: { browser: Browser }) => {
  const ctx = await setupLinkedSession({
    prefix: `room-no-love-${Date.now().toString(36)}`,
    planType: "MINI",
    sessionStatus: "ACTIVE",
  });
  const dual = await openDualContexts(browser, ctx);
  try {
    const mb = await (
      await dual.stylistPage.request.post("/api/moodboards", {
        data: { sessionId: ctx.session.id },
      })
    ).json();
    await seedMoodboardPhoto(mb.id);
    await dual.stylistPage.request.post(`/api/moodboards/${mb.id}/send`);
    const love = await dual.clientPage.request.post(
      `/api/moodboards/${mb.id}/feedback`,
      { data: { rating: "LOVE" } },
    );
    expect(love.status()).toBe(200);

    // Board itself stamped with rating.
    const { rows: boardRows } = await pool.query<{ rating: string | null }>(
      `SELECT rating FROM boards WHERE id = $1`,
      [mb.id],
    );
    expect(boardRows[0]?.rating).toBe("LOVE");

    // Zero "loved the moodboard" stage bubbles.
    const { rows: msgRows } = await pool.query<{
      kind: string;
      body: string | null;
    }>(
      `SELECT kind, body FROM messages WHERE session_id = $1 ORDER BY created_at ASC`,
      [ctx.session.id],
    );
    const stageBubbles = msgRows.filter(
      (r) =>
        r.kind === "SYSTEM_AUTOMATED" &&
        (r.body ?? "").toLowerCase().includes("loved the moodboard"),
    );
    expect(stageBubbles).toHaveLength(0);
  } finally {
    await dual.cleanup();
    await ctx.cleanup();
  }
});

test("feedbackDetail JSON persists per-image structured wizard payload", async ({
  browser,
}: { browser: Browser }) => {
  const ctx = await setupLinkedSession({
    prefix: `room-detail-${Date.now().toString(36)}`,
    planType: "MINI",
    sessionStatus: "ACTIVE",
  });
  const dual = await openDualContexts(browser, ctx);
  try {
    const mb = await (
      await dual.stylistPage.request.post("/api/moodboards", {
        data: { sessionId: ctx.session.id },
      })
    ).json();
    await seedMoodboardPhoto(mb.id);
    await dual.stylistPage.request.post(`/api/moodboards/${mb.id}/send`);

    const feedbackDetail = {
      "0": { reasons: ["Would wear", "Love the vibe"], note: "Adore this." },
      "1": { reasons: ["Too casual"], note: "" },
    };
    const res = await dual.clientPage.request.post(
      `/api/moodboards/${mb.id}/feedback`,
      {
        data: {
          rating: "LOVE",
          feedbackText: "Image 0: Would wear, Love the vibe — Adore this.",
          feedbackDetail,
        },
      },
    );
    expect(res.status()).toBe(200);

    const { rows } = await pool.query<{
      feedback_detail: unknown;
      feedback_text: string | null;
    }>(
      `SELECT feedback_detail, feedback_text FROM boards WHERE id = $1`,
      [mb.id],
    );
    expect(rows[0]?.feedback_detail).toEqual(feedbackDetail);
    expect(rows[0]?.feedback_text).toContain("Would wear");
  } finally {
    await dual.cleanup();
    await ctx.cleanup();
  }
});
