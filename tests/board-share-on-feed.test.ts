// Integration tests for the boards-and-feed changes:
//   1) sendMoodboard accepts shareOnFeed and never touches profile fields.
//   2) sendStyleboard accepts shareOnFeed alongside featureOnProfile.
//   3) sendStyleboard no longer throws STYLEBOARD_LIMIT past the plan quota.
//   4) listFeedBoards returns sent boards (either type) that opted in via
//      shareOnFeed, alongside the original profile-board surface.
//
// `sendMoodboard` and `sendStyleboard` dispatch a post-transaction Twilio
// chat message (`sendBoardMessage`) AFTER the DB write commits. CI has no
// Twilio creds, so we wrap the call in `swallowChatFanoutFailure` and then
// re-fetch the board to assert on the persisted DB state. The chat fan-out
// failing in CI is the same behaviour the existing chat / boards e2e specs
// document — it's expected and out of scope for these unit tests.

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import {
  cleanupE2EUserByEmail,
  ensureClientUser,
  ensureStylistUser,
  ensureStylistProfile,
  createSessionForClient,
  getPool,
} from "./e2e/db";

let clientEmail: string | null = null;
let stylistEmail: string | null = null;
let stylistId: string | null = null;

afterEach(async () => {
  if (stylistId) {
    await getPool().query(
      "DELETE FROM boards WHERE stylist_profile_id IN (SELECT id FROM stylist_profiles WHERE user_id = $1)",
      [stylistId],
    );
    await getPool().query("DELETE FROM stylist_profiles WHERE user_id = $1", [
      stylistId,
    ]);
  }
  if (clientEmail) await cleanupE2EUserByEmail(clientEmail);
  if (stylistEmail) await cleanupE2EUserByEmail(stylistEmail);
  clientEmail = null;
  stylistEmail = null;
  stylistId = null;
});

async function seedClientStylistSession() {
  const suffix = randomUUID().slice(0, 8);
  const cEmail = `board-feed-c-${suffix}@example.com`;
  const sEmail = `board-feed-s-${suffix}@example.com`;
  const c = await ensureClientUser({
    clerkId: `bf_c_${suffix}`,
    email: cEmail,
    firstName: "BF",
    lastName: "Client",
  });
  const s = await ensureStylistUser({
    clerkId: `bf_s_${suffix}`,
    email: sEmail,
    firstName: "BF",
    lastName: "Stylist",
  });
  clientEmail = cEmail;
  stylistEmail = sEmail;
  stylistId = s.id;
  const profile = await ensureStylistProfile({ userId: s.id });
  const session = await createSessionForClient({
    clientId: c.id,
    stylistId: s.id,
    planType: "MINI",
    status: "ACTIVE",
    amountPaidInCents: 6000,
  });
  return { session, profileId: profile.id as string };
}

/**
 * `sendMoodboard` and `sendStyleboard` post a Twilio chat message after the
 * DB transaction commits. When TWILIO_* env vars aren't set (CI), the
 * dispatch throws — but the board row is already persisted. We only care
 * about the persisted state in these tests, so swallow the post-commit
 * Twilio failure and let the assertions read the DB.
 */
async function swallowChatFanoutFailure<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Twilio") || msg.includes("TWILIO")) {
      return null;
    }
    throw err;
  }
}

test("sendMoodboard accepts shareOnFeed and leaves profile fields untouched", async () => {
  const { session } = await seedClientStylistSession();
  const { sendMoodboard } = await import("@/lib/boards/moodboard.service");
  const pool = getPool();
  const boardId = randomUUID();
  await pool.query(
    `INSERT INTO boards (id, type, session_id, created_at, updated_at)
     VALUES ($1, 'MOODBOARD', $2, NOW(), NOW())`,
    [boardId, session.id],
  );
  await pool.query(
    `INSERT INTO board_photos (id, board_id, s3_key, url, order_index, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 0, NOW(), NOW())`,
    [randomUUID(), boardId, "k", "https://example.test/moodboard.jpg"],
  );

  await swallowChatFanoutFailure(() =>
    sendMoodboard(boardId, { shareOnFeed: true }),
  );

  const { rows } = await pool.query(
    `SELECT share_on_feed, is_featured_on_profile, profile_style, sent_at
     FROM boards WHERE id = $1`,
    [boardId],
  );
  assert.equal(rows[0].share_on_feed, true);
  assert.equal(rows[0].is_featured_on_profile, false);
  assert.equal(rows[0].profile_style, null);
  assert.ok(rows[0].sent_at instanceof Date);
});

test("sendStyleboard accepts shareOnFeed and never throws STYLEBOARD_LIMIT past quota", async () => {
  const { session } = await seedClientStylistSession();
  await getPool().query(
    "UPDATE sessions SET styleboards_sent = styleboards_allowed WHERE id = $1",
    [session.id],
  );

  const { sendStyleboard } = await import("@/lib/boards/styleboard.service");
  const pool = getPool();
  const boardId = randomUUID();
  await pool.query(
    `INSERT INTO boards (id, type, session_id, created_at, updated_at)
     VALUES ($1, 'STYLEBOARD', $2, NOW(), NOW())`,
    [boardId, session.id],
  );

  await swallowChatFanoutFailure(() =>
    sendStyleboard(boardId, {
      items: [
        { source: "WEB_ADDED", webItemUrl: "https://a.test", webItemImageUrl: "https://a.test/img.jpg" },
        { source: "WEB_ADDED", webItemUrl: "https://b.test", webItemImageUrl: "https://b.test/img.jpg" },
        { source: "WEB_ADDED", webItemUrl: "https://c.test", webItemImageUrl: "https://c.test/img.jpg" },
      ],
      shareOnFeed: true,
    }),
  );

  const { rows: boardRows } = await pool.query(
    "SELECT share_on_feed, sent_at FROM boards WHERE id = $1",
    [boardId],
  );
  assert.equal(boardRows[0].share_on_feed, true);
  assert.ok(boardRows[0].sent_at instanceof Date);

  const { rows: sessionRows } = await pool.query(
    "SELECT styleboards_sent, styleboards_allowed FROM sessions WHERE id = $1",
    [session.id],
  );
  // Counter still increments past quota — that's how payouts + analytics
  // continue to fire even though the send no longer blocks at the gate.
  const allowance = sessionRows[0].styleboards_allowed;
  assert.equal(sessionRows[0].styleboards_sent, allowance + 1);
});

test("listFeedBoards surfaces a sent moodboard that opted into shareOnFeed", async () => {
  const { session, profileId } = await seedClientStylistSession();
  const { sendMoodboard } = await import("@/lib/boards/moodboard.service");
  const pool = getPool();
  const boardId = randomUUID();
  await pool.query(
    `INSERT INTO boards (id, type, session_id, stylist_profile_id, created_at, updated_at)
     VALUES ($1, 'MOODBOARD', $2, $3, NOW(), NOW())`,
    [boardId, session.id, profileId],
  );
  await pool.query(
    `INSERT INTO board_photos (id, board_id, s3_key, url, order_index, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 0, NOW(), NOW())`,
    [randomUUID(), boardId, "k", "https://example.test/moodboard.jpg"],
  );

  await swallowChatFanoutFailure(() =>
    sendMoodboard(boardId, { shareOnFeed: true }),
  );

  const { listFeedBoards } = await import("@/lib/feed/feed.service");
  const page = await listFeedBoards({ gender: "WOMEN", limit: 48 });
  const found = page.boards.find((b) => b.id === boardId);
  assert.ok(found, "Sent moodboard with shareOnFeed=true should appear in the feed");
  assert.equal(found.type, "MOODBOARD");
});

test("listFeedBoards omits a sent moodboard that did NOT opt into shareOnFeed", async () => {
  const { session, profileId } = await seedClientStylistSession();
  const { sendMoodboard } = await import("@/lib/boards/moodboard.service");
  const pool = getPool();
  const boardId = randomUUID();
  await pool.query(
    `INSERT INTO boards (id, type, session_id, stylist_profile_id, created_at, updated_at)
     VALUES ($1, 'MOODBOARD', $2, $3, NOW(), NOW())`,
    [boardId, session.id, profileId],
  );
  await pool.query(
    `INSERT INTO board_photos (id, board_id, s3_key, url, order_index, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 0, NOW(), NOW())`,
    [randomUUID(), boardId, "k", "https://example.test/m2.jpg"],
  );

  await swallowChatFanoutFailure(() => sendMoodboard(boardId, {}));

  const { listFeedBoards } = await import("@/lib/feed/feed.service");
  const page = await listFeedBoards({ gender: "WOMEN", limit: 48 });
  const found = page.boards.find((b) => b.id === boardId);
  assert.equal(found, undefined, "Moodboard without shareOnFeed must not appear in the feed");
});
