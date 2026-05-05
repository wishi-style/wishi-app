// Integration test for src/lib/stylists/profile-images.service.ts.
// Verifies the create / replace cycle for the stylist's profile
// moodboard: first call creates a Board + BoardPhoto and links it to
// StylistProfile.profileMoodboardId; second call deletes the prior
// BoardPhoto and writes a new one onto the same Board (single-image
// contract for profile moodboards).

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
} from "./e2e/db";
import { setProfileMoodboard } from "@/lib/stylists/profile-images.service";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length) {
    const fn = cleanups.pop();
    if (fn) await fn();
  }
});

async function setupStylist() {
  const suffix = randomUUID().slice(0, 8);
  const email = `pmb-stylist-${suffix}@example.com`;
  const user = await ensureStylistUser({
    clerkId: `pmb-stylist-${suffix}`,
    email,
    firstName: "PMB",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: user.id });
  cleanups.push(async () => {
    await cleanupStylistProfile(user.id);
    await cleanupE2EUserByEmail(email);
  });
  return user;
}

test("setProfileMoodboard creates a new Board+BoardPhoto on first call", async () => {
  const user = await setupStylist();
  const result = await setProfileMoodboard(user.id, "key/first.jpg", "https://cdn/first.jpg");
  assert.ok(result.boardId);
  assert.ok(result.photoId);

  const { rows: profileRows } = await getPool().query(
    `SELECT profile_moodboard_id FROM stylist_profiles WHERE user_id = $1`,
    [user.id],
  );
  assert.equal(profileRows[0].profile_moodboard_id, result.boardId);

  const { rows: boardRows } = await getPool().query(
    `SELECT type, is_featured_on_profile, session_id FROM boards WHERE id = $1`,
    [result.boardId],
  );
  assert.equal(boardRows[0].type, "MOODBOARD");
  assert.equal(boardRows[0].is_featured_on_profile, true);
  assert.equal(boardRows[0].session_id, null);

  const { rows: photoRows } = await getPool().query(
    `SELECT s3_key, url, order_index FROM board_photos WHERE board_id = $1`,
    [result.boardId],
  );
  assert.equal(photoRows.length, 1);
  assert.equal(photoRows[0].s3_key, "key/first.jpg");
  assert.equal(photoRows[0].url, "https://cdn/first.jpg");
});

test("setProfileMoodboard replaces the photo on a second call (single-image)", async () => {
  const user = await setupStylist();
  const first = await setProfileMoodboard(user.id, "key/a.jpg", "https://cdn/a.jpg");
  const second = await setProfileMoodboard(user.id, "key/b.jpg", "https://cdn/b.jpg");

  // Same board, new photo.
  assert.equal(first.boardId, second.boardId);
  assert.notEqual(first.photoId, second.photoId);

  const { rows } = await getPool().query(
    `SELECT s3_key, url FROM board_photos WHERE board_id = $1 ORDER BY created_at`,
    [first.boardId],
  );
  assert.equal(rows.length, 1, "old photo should be deleted");
  assert.equal(rows[0].s3_key, "key/b.jpg");
  assert.equal(rows[0].url, "https://cdn/b.jpg");
});

test("setProfileMoodboard throws when the user has no stylist profile", async () => {
  const suffix = randomUUID().slice(0, 8);
  const email = `pmb-noprofile-${suffix}@example.com`;
  const user = await ensureStylistUser({
    clerkId: `pmb-noprofile-${suffix}`,
    email,
    firstName: "No",
    lastName: "Profile",
  });
  cleanups.push(async () => {
    await cleanupE2EUserByEmail(email);
  });

  await assert.rejects(
    () => setProfileMoodboard(user.id, "k", "u"),
    /No stylist profile/,
  );
});
