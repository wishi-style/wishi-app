import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import "dotenv/config";
import {
  cleanupE2EUserByEmail,
  createBoardFixture,
  createSessionForClient,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
} from "./e2e/db";
import { listDeliveredStyleboardsForClient } from "@/lib/profile/delivered-styleboards.service";

const emails: string[] = [];
const sessionIds: string[] = [];

afterEach(async () => {
  const pool = getPool();
  // boards.session_id is ON DELETE SET NULL — deleting sessions leaves
  // orphan boards (+ cascaded board_items) behind. Drop them by sessionId
  // BEFORE the user-cleanup deletes the sessions themselves.
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

async function seedClientWithStylist() {
  const ts = Date.now() + Math.floor(Math.random() * 10_000);
  const clientEmail = `dlb-c-${ts}@e2e.wishi.test`;
  const stylistEmail = `dlb-s-${ts}@e2e.wishi.test`;
  emails.push(clientEmail, stylistEmail);

  const client = await ensureClientUser({
    clerkId: `e2e_dlb_c_${ts}`,
    email: clientEmail,
    firstName: "Deliver",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_dlb_s_${ts}`,
    email: stylistEmail,
    firstName: "Maya",
    lastName: "Brooks",
  });
  await ensureStylistProfile({ userId: stylist.id });
  return { client, stylist };
}

test("listDeliveredStyleboardsForClient returns every delivered styleboard newest first", async () => {
  const { client, stylist } = await seedClientWithStylist();
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "COMPLETED",
    planType: "MAJOR",
  });
  sessionIds.push(session.id);

  const older = await createBoardFixture({
    sessionId: session.id,
    type: "STYLEBOARD",
    sentMinutesAgo: 120,
    title: "Older look",
  });
  const newer = await createBoardFixture({
    sessionId: session.id,
    type: "STYLEBOARD",
    sentMinutesAgo: 5,
    title: "Newer look",
  });

  const looks = await listDeliveredStyleboardsForClient(client.id);
  assert.equal(looks.length, 2);
  assert.equal(looks[0].boardId, newer.id, "newest first");
  assert.equal(looks[1].boardId, older.id);
  assert.equal(looks[0].stylistFirstName, "Maya");
  assert.ok(looks[0].sentAt instanceof Date);
});

test("listDeliveredStyleboardsForClient excludes moodboards", async () => {
  const { client, stylist } = await seedClientWithStylist();
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MINI",
  });
  sessionIds.push(session.id);

  await createBoardFixture({
    sessionId: session.id,
    type: "MOODBOARD",
    sentMinutesAgo: 30,
  });
  const styleboard = await createBoardFixture({
    sessionId: session.id,
    type: "STYLEBOARD",
    sentMinutesAgo: 10,
  });

  const looks = await listDeliveredStyleboardsForClient(client.id);
  assert.equal(looks.length, 1);
  assert.equal(looks[0].boardId, styleboard.id);
});

test("listDeliveredStyleboardsForClient excludes unsent (draft) styleboards", async () => {
  const { client, stylist } = await seedClientWithStylist();
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MINI",
  });
  sessionIds.push(session.id);

  const draftId = "drft_" + Math.random().toString(36).slice(2, 12);
  await getPool().query(
    `INSERT INTO boards (id, type, session_id, sent_at, created_at, updated_at)
     VALUES ($1, 'STYLEBOARD', $2, NULL, NOW(), NOW())`,
    [draftId, session.id],
  );

  const looks = await listDeliveredStyleboardsForClient(client.id);
  assert.equal(looks.length, 0);
});

test("listDeliveredStyleboardsForClient only returns boards for this client", async () => {
  const seedA = await seedClientWithStylist();
  const seedB = await seedClientWithStylist();

  const sessionA = await createSessionForClient({
    clientId: seedA.client.id,
    stylistId: seedA.stylist.id,
    status: "COMPLETED",
    planType: "MAJOR",
  });
  sessionIds.push(sessionA.id);
  const sessionB = await createSessionForClient({
    clientId: seedB.client.id,
    stylistId: seedB.stylist.id,
    status: "COMPLETED",
    planType: "MAJOR",
  });
  sessionIds.push(sessionB.id);

  await createBoardFixture({ sessionId: sessionA.id, type: "STYLEBOARD" });
  await createBoardFixture({ sessionId: sessionB.id, type: "STYLEBOARD" });

  const looksA = await listDeliveredStyleboardsForClient(seedA.client.id);
  assert.equal(looksA.length, 1);
  const looksB = await listDeliveredStyleboardsForClient(seedB.client.id);
  assert.equal(looksB.length, 1);
  assert.notEqual(looksA[0].boardId, looksB[0].boardId);
});
