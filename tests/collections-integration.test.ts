// Integration test for src/lib/collections/collection.service.ts.
// Drives the SUT against the local Postgres (same harness as the rest of
// the integration suite). Verifies the cover-preview ordering invariant
// that Copilot flagged, plus the basic CRUD round-trip.

import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import {
  cleanupE2EUserByEmail,
  ensureClientUser,
  getPool,
} from "./e2e/db";
import {
  addItemsToCollection,
  createCollection,
  deleteCollection,
  getCollection,
  listCollections,
  removeItemFromCollection,
  updateCollection,
} from "@/lib/collections/collection.service";

let user: { id: string };
let userEmail: string;
let foreignUser: { id: string };
let foreignEmail: string;

before(async () => {
  const pool = getPool();
  const { rows } = await pool.query("SELECT 1 FROM users LIMIT 1");
  void rows;
});

afterEach(async () => {
  await getPool().query(
    `DELETE FROM closet_items WHERE user_id IN ($1, $2)`,
    [user?.id ?? null, foreignUser?.id ?? null],
  );
  await getPool().query(
    `DELETE FROM collections WHERE user_id IN ($1, $2)`,
    [user?.id ?? null, foreignUser?.id ?? null],
  );
  if (userEmail) await cleanupE2EUserByEmail(userEmail);
  if (foreignEmail) await cleanupE2EUserByEmail(foreignEmail);
});

async function createClosetItem(
  userId: string,
  url: string,
): Promise<{ id: string }> {
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO closet_items (id, user_id, s3_key, url, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())`,
    [id, userId, `key/${id}`, url],
  );
  return { id };
}

async function setupUser() {
  const suffix = randomUUID().slice(0, 8);
  userEmail = `collections-${suffix}@example.com`;
  user = await ensureClientUser({
    clerkId: `coll-${suffix}`,
    email: userEmail,
    firstName: "Coll",
    lastName: "Test",
  });
}

test("createCollection writes name + assigns sortOrder in input order", async () => {
  await setupUser();
  // Create 5 closet items with predictable URLs.
  const items = await Promise.all(
    [0, 1, 2, 3, 4].map((i) =>
      createClosetItem(user.id, `https://img.test/${i}.jpg`),
    ),
  );

  // Pass them in REVERSE order — the saved sortOrder must reflect the
  // call order, not Prisma's findMany IN-clause order.
  const reversed = [...items].reverse().map((i) => i.id);
  const collection = await createCollection(user.id, "  Spring Capsule  ", reversed);

  assert.equal(collection.name, "Spring Capsule");

  const detail = await getCollection(user.id, collection.id);
  assert.equal(detail.items.length, 5);
  // sortOrder 0 should be the first id from the reversed array (= last item).
  assert.equal(detail.items[0].closetItem.id, items[4].id);
  assert.equal(detail.items[4].closetItem.id, items[0].id);
});

test("createCollection rejects items the caller doesn't own", async () => {
  await setupUser();
  const foreignSuffix = randomUUID().slice(0, 8);
  foreignEmail = `foreign-${foreignSuffix}@example.com`;
  foreignUser = await ensureClientUser({
    clerkId: `foreign-${foreignSuffix}`,
    email: foreignEmail,
    firstName: "Foreign",
    lastName: "User",
  });
  const stolen = await createClosetItem(foreignUser.id, "https://img.test/stolen.jpg");
  const own = await createClosetItem(user.id, "https://img.test/own.jpg");

  const collection = await createCollection(user.id, "Mixed", [stolen.id, own.id]);
  const detail = await getCollection(user.id, collection.id);
  assert.equal(detail.items.length, 1);
  assert.equal(detail.items[0].closetItem.id, own.id);
});

test("listCollections preview pulls the first 4 items by sortOrder", async () => {
  await setupUser();
  const items = await Promise.all(
    [0, 1, 2, 3, 4, 5].map((i) =>
      createClosetItem(user.id, `https://img.test/${i}.jpg`),
    ),
  );
  const ids = items.map((i) => i.id);
  await createCollection(user.id, "Cover Test", ids);

  const collections = await listCollections(user.id);
  assert.equal(collections.length, 1);
  const c = collections[0];
  assert.equal(c.itemCount, 6);
  assert.equal(c.previewImages.length, 4);
  // Preview must be the FIRST 4 in sortOrder, which equals input order.
  assert.deepEqual(c.previewImages, [
    "https://img.test/0.jpg",
    "https://img.test/1.jpg",
    "https://img.test/2.jpg",
    "https://img.test/3.jpg",
  ]);
});

test("addItemsToCollection appends with stable sortOrder + skips foreign items", async () => {
  await setupUser();
  const foreignSuffix = randomUUID().slice(0, 8);
  foreignEmail = `add-foreign-${foreignSuffix}@example.com`;
  foreignUser = await ensureClientUser({
    clerkId: `addforeign-${foreignSuffix}`,
    email: foreignEmail,
    firstName: "Add",
    lastName: "Foreign",
  });

  const initial = await Promise.all(
    [0, 1].map((i) => createClosetItem(user.id, `https://img.test/init-${i}.jpg`)),
  );
  const collection = await createCollection(user.id, "Stash", initial.map((i) => i.id));

  // Now add three more, one of which is foreign — that one must be skipped.
  const more = await Promise.all(
    [0, 1, 2].map((i) => createClosetItem(user.id, `https://img.test/more-${i}.jpg`)),
  );
  const stolen = await createClosetItem(foreignUser.id, "https://img.test/stolen.jpg");

  // Order: more[2], stolen, more[0], more[1]. Saved sortOrder for owned
  // items must follow that order (skipping stolen), so the new tail is
  // [more[2], more[0], more[1]] at sortOrder 2,3,4.
  const result = await addItemsToCollection(user.id, collection.id, [
    more[2].id,
    stolen.id,
    more[0].id,
    more[1].id,
  ]);
  assert.equal(result.added.length, 3);
  assert.deepEqual(result.skipped, [stolen.id]);

  const detail = await getCollection(user.id, collection.id);
  const ids = detail.items.map((it) => it.closetItem.id);
  assert.deepEqual(ids, [
    initial[0].id,
    initial[1].id,
    more[2].id,
    more[0].id,
    more[1].id,
  ]);
});

test("addItemsToCollection is idempotent for items already in the collection", async () => {
  await setupUser();
  const item = await createClosetItem(user.id, "https://img.test/x.jpg");
  const collection = await createCollection(user.id, "Stash", [item.id]);

  const result = await addItemsToCollection(user.id, collection.id, [item.id]);
  assert.equal(result.added.length, 0);

  const detail = await getCollection(user.id, collection.id);
  assert.equal(detail.items.length, 1);
});

test("updateCollection trims + persists name; rename returns updated row", async () => {
  await setupUser();
  const collection = await createCollection(user.id, "Original");
  const updated = await updateCollection(user.id, collection.id, {
    name: "  Renamed  ",
  });
  assert.equal(updated.name, "Renamed");
});

test("removeItemFromCollection drops only that pair", async () => {
  await setupUser();
  const items = await Promise.all(
    [0, 1, 2].map((i) => createClosetItem(user.id, `https://img.test/${i}.jpg`)),
  );
  const collection = await createCollection(user.id, "Stash", items.map((i) => i.id));

  await removeItemFromCollection(user.id, collection.id, items[1].id);
  const detail = await getCollection(user.id, collection.id);
  assert.equal(detail.items.length, 2);
  assert.deepEqual(
    detail.items.map((it) => it.closetItem.id),
    [items[0].id, items[2].id],
  );
});

test("deleteCollection removes the collection (items in closet remain)", async () => {
  await setupUser();
  const item = await createClosetItem(user.id, "https://img.test/keep.jpg");
  const collection = await createCollection(user.id, "Tmp", [item.id]);

  await deleteCollection(user.id, collection.id);

  await assert.rejects(getCollection(user.id, collection.id));
  // Closet item itself should still be there.
  const { rows } = await getPool().query(
    `SELECT id FROM closet_items WHERE id = $1`,
    [item.id],
  );
  assert.equal(rows.length, 1);
});

test("foreign user can't read or mutate someone else's collection", async () => {
  await setupUser();
  const foreignSuffix = randomUUID().slice(0, 8);
  foreignEmail = `auth-${foreignSuffix}@example.com`;
  foreignUser = await ensureClientUser({
    clerkId: `auth-${foreignSuffix}`,
    email: foreignEmail,
    firstName: "Auth",
    lastName: "Probe",
  });

  const collection = await createCollection(user.id, "Mine");

  await assert.rejects(getCollection(foreignUser.id, collection.id));
  await assert.rejects(deleteCollection(foreignUser.id, collection.id));
  await assert.rejects(
    updateCollection(foreignUser.id, collection.id, { name: "hacked" }),
  );
});
