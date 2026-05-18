// Integration tests for the boards-and-feed changes:
//   1) sendMoodboard accepts shareOnFeed and never touches profile fields.
//   2) sendStyleboard accepts shareOnFeed alongside featureOnProfile.
//   3) sendStyleboard no longer throws STYLEBOARD_LIMIT past the plan quota.
//   4) listFeedBoards returns sent boards (either type) that opted in via
//      shareOnFeed, alongside the original profile-board surface.

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

let client: { id: string } | null = null;
let stylist: { id: string } | null = null;

afterEach(async () => {
  if (client?.id) {
    await cleanupE2EUserByEmail(`board-feed-c-${client.id}@example.com`);
  }
  if (stylist?.id) {
    await getPool().query(
      "DELETE FROM boards WHERE stylist_profile_id IN (SELECT id FROM stylist_profiles WHERE user_id = $1)",
      [stylist.id],
    );
    await getPool().query("DELETE FROM stylist_profiles WHERE user_id = $1", [
      stylist.id,
    ]);
    await cleanupE2EUserByEmail(`board-feed-s-${stylist.id}@example.com`);
  }
  client = null;
  stylist = null;
});

async function seedClientStylistSession() {
  const suffix = randomUUID().slice(0, 8);
  const c = await ensureClientUser({
    clerkId: `bf_c_${suffix}`,
    email: `board-feed-c-${suffix}@example.com`,
    firstName: "BF",
    lastName: "Client",
  });
  const s = await ensureStylistUser({
    clerkId: `bf_s_${suffix}`,
    email: `board-feed-s-${suffix}@example.com`,
    firstName: "BF",
    lastName: "Stylist",
  });
  client = c;
  stylist = s;
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
  // 1 photo is enough to satisfy the non-empty guard.
  await pool.query(
    `INSERT INTO board_photos (id, board_id, s3_key, url, order_index, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 0, NOW(), NOW())`,
    [randomUUID(), boardId, "k", "https://example.test/moodboard.jpg"],
  );

  const sent = await sendMoodboard(boardId, { shareOnFeed: true });
  assert.equal(sent.shareOnFeed, true);
  assert.equal(sent.isFeaturedOnProfile, false);
  assert.equal(sent.profileStyle, null);
  assert.ok(sent.sentAt instanceof Date);
});

test("sendStyleboard accepts shareOnFeed and never throws STYLEBOARD_LIMIT past quota", async () => {
  const { session } = await seedClientStylistSession();
  // Pin the session at quota — the gate previously threw here.
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

  const sent = await sendStyleboard(boardId, {
    items: [
      { source: "WEB_ADDED", webItemUrl: "https://a.test", webItemImageUrl: "https://a.test/img.jpg" },
      { source: "WEB_ADDED", webItemUrl: "https://b.test", webItemImageUrl: "https://b.test/img.jpg" },
      { source: "WEB_ADDED", webItemUrl: "https://c.test", webItemImageUrl: "https://c.test/img.jpg" },
    ],
    shareOnFeed: true,
  });
  assert.equal(sent.shareOnFeed, true);
  assert.ok(sent.sentAt instanceof Date);

  const { rows } = await pool.query(
    "SELECT styleboards_sent, styleboards_allowed FROM sessions WHERE id = $1",
    [session.id],
  );
  // Counter still increments past quota — that's how payouts + analytics
  // continue to fire even though the send no longer blocks at the gate.
  const allowance = rows[0].styleboards_allowed;
  assert.equal(rows[0].styleboards_sent, allowance + 1);
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

  await sendMoodboard(boardId, { shareOnFeed: true });

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

  await sendMoodboard(boardId, {});

  const { listFeedBoards } = await import("@/lib/feed/feed.service");
  const page = await listFeedBoards({ gender: "WOMEN", limit: 48 });
  const found = page.boards.find((b) => b.id === boardId);
  assert.equal(found, undefined, "Moodboard without shareOnFeed must not appear in the feed");
});
