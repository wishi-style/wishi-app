// Integration test for the sessionless profile-board publish path.
// Covers the moodboard happy path, styleboard happy path, ownership
// rejection, and minimum-content gates.

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
import {
  createProfileBoard,
  publishProfileBoard,
  MIN_STYLEBOARD_ITEMS,
} from "@/lib/boards/profile-boards.service";
import { DomainError, NotFoundError } from "@/lib/errors/domain-error";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length) {
    const fn = cleanups.pop();
    if (fn) await fn();
  }
});

async function setupStylist() {
  const suffix = randomUUID().slice(0, 8);
  const email = `profile-publish-${suffix}@example.com`;
  const user = await ensureStylistUser({
    clerkId: `profile-publish-${suffix}`,
    email,
    firstName: "Profile",
    lastName: "Publish",
  });
  await ensureStylistProfile({ userId: user.id });
  cleanups.push(async () => {
    await cleanupStylistProfile(user.id);
    await cleanupE2EUserByEmail(email);
  });
  return user;
}

test("publishProfileBoard flips a moodboard to featured with cover + style", async () => {
  const user = await setupStylist();
  const board = await createProfileBoard({
    stylistUserId: user.id,
    profileStyle: "Classic",
    type: "MOODBOARD",
  });
  assert.equal(board.isFeaturedOnProfile, false);
  assert.equal(board.type, "MOODBOARD");

  // Add one photo so the publish gate clears.
  await getPool().query(
    `INSERT INTO board_photos (id, board_id, s3_key, url, order_index, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 0, NOW(), NOW())`,
    [randomUUID(), board.id, `s3/${board.id}.jpg`, "https://example.com/photo.jpg"],
  );

  const updated = await publishProfileBoard({
    stylistUserId: user.id,
    boardId: board.id,
    profileStyle: "Romantic",
    coverUrl: "https://example.com/cover.jpg",
  });

  assert.equal(updated.isFeaturedOnProfile, true);
  assert.equal(updated.profileStyle, "Romantic");
  assert.equal(updated.coverUrl, "https://example.com/cover.jpg");
});

test("publishProfileBoard rejects moodboards with zero photos", async () => {
  const user = await setupStylist();
  const board = await createProfileBoard({
    stylistUserId: user.id,
    profileStyle: "Classic",
    type: "MOODBOARD",
  });

  await assert.rejects(
    () =>
      publishProfileBoard({
        stylistUserId: user.id,
        boardId: board.id,
      }),
    (err: unknown) => err instanceof DomainError && err.status === 400,
  );
});

test("publishProfileBoard rejects styleboards under the item floor", async () => {
  const user = await setupStylist();
  const board = await createProfileBoard({
    stylistUserId: user.id,
    profileStyle: "Edgy",
    type: "STYLEBOARD",
  });

  await assert.rejects(
    () =>
      publishProfileBoard({
        stylistUserId: user.id,
        boardId: board.id,
        items: [
          { source: "INVENTORY", inventoryProductId: "p1" },
          { source: "INVENTORY", inventoryProductId: "p2" },
        ],
      }),
    (err: unknown) =>
      err instanceof DomainError &&
      err.message.includes(`${MIN_STYLEBOARD_ITEMS}`),
  );
});

test("publishProfileBoard writes items + sets sentAt for STYLEBOARDs", async () => {
  const user = await setupStylist();
  const board = await createProfileBoard({
    stylistUserId: user.id,
    profileStyle: "Bohemian",
    type: "STYLEBOARD",
  });

  const updated = await publishProfileBoard({
    stylistUserId: user.id,
    boardId: board.id,
    items: [
      { source: "INVENTORY", inventoryProductId: "p1", x: 10, y: 20, zIndex: 0 },
      { source: "INVENTORY", inventoryProductId: "p2", x: 30, y: 40, zIndex: 1 },
      { source: "INVENTORY", inventoryProductId: "p3", x: 50, y: 60, zIndex: 2 },
    ],
    coverUrl: "https://example.com/styleboard-cover.jpg",
    title: "Brunch capsule",
  });

  assert.equal(updated.isFeaturedOnProfile, true);
  assert.equal(updated.coverUrl, "https://example.com/styleboard-cover.jpg");
  assert.equal(updated.title, "Brunch capsule");
  assert.notEqual(updated.sentAt, null);

  const items = await getPool().query(
    `SELECT inventory_product_id, order_index FROM board_items WHERE board_id = $1 ORDER BY order_index`,
    [board.id],
  );
  assert.equal(items.rows.length, 3);
  assert.equal(items.rows[0].inventory_product_id, "p1");
  assert.equal(items.rows[2].inventory_product_id, "p3");
});

test("publishProfileBoard rejects publishing a board owned by another stylist", async () => {
  const owner = await setupStylist();
  const stranger = await setupStylist();
  const board = await createProfileBoard({
    stylistUserId: owner.id,
    profileStyle: "Classic",
    type: "MOODBOARD",
  });
  await getPool().query(
    `INSERT INTO board_photos (id, board_id, s3_key, url, order_index, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 0, NOW(), NOW())`,
    [randomUUID(), board.id, `s3/${board.id}.jpg`, "https://example.com/photo.jpg"],
  );

  await assert.rejects(
    () =>
      publishProfileBoard({
        stylistUserId: stranger.id,
        boardId: board.id,
      }),
    (err: unknown) => err instanceof NotFoundError,
  );
});
