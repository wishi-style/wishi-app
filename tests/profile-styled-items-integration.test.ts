import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  cleanupE2EUserByEmail,
  createBoardFixture,
  createSessionForClient,
  ensureClientUser,
  ensureStylistUser,
  getPool,
} from "./e2e/db";
import { listStyledInventoryItemsForUser } from "@/lib/profile/styled-items.service";

const emails: string[] = [];
const sessionIds: string[] = [];

afterEach(async () => {
  const pool = getPool();
  // boards.session_id is ON DELETE SET NULL — drop boards + board_items
  // BEFORE user cleanup so they don't accumulate as orphans.
  if (sessionIds.length > 0) {
    await pool.query(
      `DELETE FROM board_items WHERE board_id IN (SELECT id FROM boards WHERE session_id = ANY($1::text[]))`,
      [sessionIds],
    );
    await pool.query(`DELETE FROM boards WHERE session_id = ANY($1::text[])`, [
      sessionIds,
    ]);
    sessionIds.length = 0;
  }
  while (emails.length > 0) {
    const email = emails.pop()!;
    await cleanupE2EUserByEmail(email);
  }
});

async function seedSetup() {
  const ts = Date.now() + Math.floor(Math.random() * 10_000);
  const clientEmail = `sti-c-${ts}@e2e.wishi.test`;
  const stylistEmail = `sti-s-${ts}@e2e.wishi.test`;
  emails.push(clientEmail, stylistEmail);

  const client = await ensureClientUser({
    clerkId: `e2e_sti_c_${ts}`,
    email: clientEmail,
    firstName: "Style",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_sti_s_${ts}`,
    email: stylistEmail,
    firstName: "Maya",
    lastName: "Brooks",
  });
  return { client, stylist };
}

async function addBoardItem(
  boardId: string,
  inventoryProductId: string,
  orderIndex = 0,
) {
  const id = "bi_" + randomUUID().replace(/-/g, "").slice(0, 24);
  await getPool().query(
    `INSERT INTO board_items (id, board_id, source, order_index, inventory_product_id, created_at, updated_at)
     VALUES ($1, $2, 'INVENTORY', $3, $4, NOW(), NOW())`,
    [id, boardId, orderIndex, inventoryProductId],
  );
}

test("listStyledInventoryItemsForUser returns one row per unique inventoryProductId, most recent styleboard wins", async () => {
  const { client, stylist } = await seedSetup();
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });
  sessionIds.push(session.id);

  const older = await createBoardFixture({
    sessionId: session.id,
    type: "STYLEBOARD",
    sentMinutesAgo: 120,
  });
  const newer = await createBoardFixture({
    sessionId: session.id,
    type: "STYLEBOARD",
    sentMinutesAgo: 5,
  });

  // PROD_A appears on both boards — the newer should win the attribution.
  await addBoardItem(older.id, "PROD_A", 0);
  await addBoardItem(newer.id, "PROD_A", 0);
  // PROD_B only appears on the older board.
  await addBoardItem(older.id, "PROD_B", 1);

  const items = await listStyledInventoryItemsForUser(client.id);
  assert.equal(items.length, 2);
  const byId = new Map(items.map((i) => [i.inventoryProductId, i]));
  assert.equal(byId.get("PROD_A")?.sourceBoardId, newer.id);
  assert.equal(byId.get("PROD_B")?.sourceBoardId, older.id);
});

test("listStyledInventoryItemsForUser excludes moodboards, drafts, and other users' sessions", async () => {
  const setupA = await seedSetup();
  const setupB = await seedSetup();

  const sessionA = await createSessionForClient({
    clientId: setupA.client.id,
    stylistId: setupA.stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });
  sessionIds.push(sessionA.id);
  const sessionB = await createSessionForClient({
    clientId: setupB.client.id,
    stylistId: setupB.stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });
  sessionIds.push(sessionB.id);

  const mood = await createBoardFixture({
    sessionId: sessionA.id,
    type: "MOODBOARD",
  });
  await addBoardItem(mood.id, "PROD_MOOD");

  const draftId = "drft_" + randomUUID().replace(/-/g, "").slice(0, 12);
  await getPool().query(
    `INSERT INTO boards (id, type, session_id, sent_at, created_at, updated_at)
     VALUES ($1, 'STYLEBOARD', $2, NULL, NOW(), NOW())`,
    [draftId, sessionA.id],
  );
  await addBoardItem(draftId, "PROD_DRAFT");

  const sbB = await createBoardFixture({
    sessionId: sessionB.id,
    type: "STYLEBOARD",
  });
  await addBoardItem(sbB.id, "PROD_FOREIGN");

  const sbA = await createBoardFixture({
    sessionId: sessionA.id,
    type: "STYLEBOARD",
  });
  await addBoardItem(sbA.id, "PROD_OWN");

  const itemsA = await listStyledInventoryItemsForUser(setupA.client.id);
  assert.deepEqual(
    itemsA.map((i) => i.inventoryProductId),
    ["PROD_OWN"],
  );
});

test("listStyledInventoryItemsForUser returns empty array for a client with no sessions", async () => {
  const { client } = await seedSetup();
  const items = await listStyledInventoryItemsForUser(client.id);
  assert.deepEqual(items, []);
});
