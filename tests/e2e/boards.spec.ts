import { expect, test } from "@playwright/test";
import Twilio from "twilio";
import { randomUUID } from "node:crypto";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  createSessionForClient,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
  disconnectTestDb,
} from "./db";

const TWILIO_SERVICE = process.env.TWILIO_CONVERSATIONS_SERVICE_SID!;

function twilio() {
  return Twilio(
    process.env.TWILIO_API_KEY_SID!,
    process.env.TWILIO_API_KEY_SECRET!,
    { accountSid: process.env.TWILIO_ACCOUNT_SID! },
  );
}

async function provisionTwilioConversation(sessionId: string, clientClerkId: string, stylistClerkId: string) {
  const client = twilio();
  const conversation = await client.conversations.v1
    .services(TWILIO_SERVICE)
    .conversations.create({
      friendlyName: `E2E Session ${sessionId}`,
      uniqueName: `session-${sessionId}`,
    });
  await Promise.all([
    client.conversations.v1
      .services(TWILIO_SERVICE)
      .conversations(conversation.sid)
      .participants.create({ identity: clientClerkId }),
    client.conversations.v1
      .services(TWILIO_SERVICE)
      .conversations(conversation.sid)
      .participants.create({ identity: stylistClerkId }),
  ]);
  await getPool().query(
    `UPDATE sessions SET twilio_channel_sid = $1 WHERE id = $2`,
    [conversation.sid, sessionId],
  );
  return conversation.sid;
}

async function cleanupTwilioConversation(sid: string | null) {
  if (!sid) return;
  try {
    await twilio().conversations.v1.services(TWILIO_SERVICE).conversations(sid).remove();
  } catch {
    // already gone
  }
}

interface Ctx {
  client: { id: string; email: string; clerkId: string };
  stylist: { id: string; email: string; clerkId: string };
  stylistProfile: { id: string };
  session: { id: string };
  channelSid: string;
  cleanup: () => Promise<void>;
}

async function setupBoardSession(prefix: string): Promise<Ctx> {
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const clientEmail = `${prefix}-client-${ts}@e2e.wishi.test`;
  const stylistEmail = `${prefix}-stylist-${ts}@e2e.wishi.test`;
  const clientClerkId = `e2e_${prefix}_client_${ts}`;
  const stylistClerkId = `e2e_${prefix}_stylist_${ts}`;

  const client = await ensureClientUser({
    clerkId: clientClerkId,
    email: clientEmail,
    firstName: "Board",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: stylistClerkId,
    email: stylistEmail,
    firstName: "Board",
    lastName: "Stylist",
  });
  const stylistProfile = await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MINI",
  });
  const channelSid = await provisionTwilioConversation(session.id, clientClerkId, stylistClerkId);

  return {
    client: { id: client.id, email: clientEmail, clerkId: clientClerkId },
    stylist: { id: stylist.id, email: stylistEmail, clerkId: stylistClerkId },
    stylistProfile: { id: stylistProfile.id },
    session: { id: session.id },
    channelSid,
    cleanup: async () => {
      await cleanupTwilioConversation(channelSid);
      const p = getPool();
      await p.query(
        `DELETE FROM messages WHERE session_id = $1`,
        [session.id],
      );
      await p.query(
        `DELETE FROM session_pending_actions WHERE session_id = $1`,
        [session.id],
      );
      await p.query(`DELETE FROM board_items WHERE board_id IN (SELECT id FROM boards WHERE session_id = $1)`, [session.id]);
      await p.query(`DELETE FROM board_photos WHERE board_id IN (SELECT id FROM boards WHERE session_id = $1)`, [session.id]);
      await p.query(`DELETE FROM favorite_boards WHERE board_id IN (SELECT id FROM boards WHERE session_id = $1)`, [session.id]);
      await p.query(`DELETE FROM boards WHERE session_id = $1`, [session.id]);
      await p.query(`DELETE FROM closet_items WHERE user_id = $1`, [client.id]);
      await cleanupStylistProfile(stylist.id);
      await cleanupE2EUserByEmail(clientEmail);
      await cleanupE2EUserByEmail(stylistEmail);
    },
  };
}

async function insertBoardPhoto(boardId: string, url: string, orderIndex: number) {
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO board_photos (id, board_id, s3_key, url, order_index, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
    [id, boardId, `test/${id}.png`, url, orderIndex],
  );
  return id;
}

async function getBoards(sessionId: string) {
  const { rows } = await getPool().query(
    `SELECT * FROM boards WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId],
  );
  return rows;
}

async function getBoardItems(boardId: string) {
  const { rows } = await getPool().query(
    `SELECT * FROM board_items WHERE board_id = $1 ORDER BY order_index ASC`,
    [boardId],
  );
  return rows;
}

async function getPendingActions(sessionId: string) {
  const { rows } = await getPool().query(
    `SELECT * FROM session_pending_actions WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId],
  );
  return rows;
}

async function getMessages(sessionId: string) {
  const { rows } = await getPool().query(
    `SELECT id, kind, system_template, board_id FROM messages WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId],
  );
  return rows;
}

async function getSession(sessionId: string) {
  const { rows } = await getPool().query(
    `SELECT * FROM sessions WHERE id = $1`,
    [sessionId],
  );
  return rows[0];
}

test.afterAll(async () => {
  await disconnectTestDb();
});

test.describe("Phase 4: boards", () => {
  test("moodboard happy path: create → send → client loves → pending actions roll", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const ctx = await setupBoardSession("moodboard");
    try {
      // Stylist signs in and creates a moodboard via API
      const stylistCtx = await browser.newContext();
      const stylistPage = await stylistCtx.newPage();
      await stylistPage.goto("/sign-in");
      await stylistPage.getByLabel("Email").fill(ctx.stylist.email);
      await stylistPage.getByRole("button", { name: "Sign In" }).click();
      await expect(stylistPage).toHaveURL(/\/(sessions|stylist)/);

      const createRes = await stylistPage.request.post("/api/moodboards", {
        data: { sessionId: ctx.session.id },
      });
      expect(createRes.status()).toBe(201);
      const board = await createRes.json();
      expect(board.type).toBe("MOODBOARD");

      // Seed 3 photos (bypass S3)
      await insertBoardPhoto(board.id, "https://placehold.co/400x400/aaa/png", 0);
      await insertBoardPhoto(board.id, "https://placehold.co/400x400/bbb/png", 1);
      await insertBoardPhoto(board.id, "https://placehold.co/400x400/ccc/png", 2);

      // Send
      const sendRes = await stylistPage.request.post(
        `/api/moodboards/${board.id}/send`,
      );
      expect(sendRes.status()).toBe(200);

      // Give the webhook a moment to persist
      await expect
        .poll(async () => (await getMessages(ctx.session.id)).length, {
          timeout: 15_000,
        })
        .toBeGreaterThanOrEqual(2); // MOODBOARD + SYSTEM_AUTOMATED

      const msgs = await getMessages(ctx.session.id);
      expect(msgs.some((m) => m.kind === "MOODBOARD" && m.board_id === board.id)).toBe(true);
      expect(
        msgs.some((m) => m.system_template === "MOODBOARD_DELIVERED"),
      ).toBe(true);

      // Client signs in and rates LOVE
      const clientCtx = await browser.newContext();
      const clientPage = await clientCtx.newPage();
      await clientPage.goto("/sign-in");
      await clientPage.getByLabel("Email").fill(ctx.client.email);
      await clientPage.getByRole("button", { name: "Sign In" }).click();
      await expect(clientPage).toHaveURL(/\/sessions/);

      const rateRes = await clientPage.request.post(
        `/api/moodboards/${board.id}/feedback`,
        { data: { rating: "LOVE" } },
      );
      expect(rateRes.status()).toBe(200);

      // Assertions
      await expect
        .poll(async () => (await getMessages(ctx.session.id)).length, {
          timeout: 15_000,
        })
        .toBeGreaterThanOrEqual(3);

      const boards = await getBoards(ctx.session.id);
      expect(boards).toHaveLength(1);
      expect(boards[0].rating).toBe("LOVE");

      const actions = await getPendingActions(ctx.session.id);
      const feedbackAction = actions.find(
        (a) => a.type === "PENDING_CLIENT_FEEDBACK",
      );
      expect(feedbackAction?.status).toBe("RESOLVED");
      const styleboardAction = actions.find(
        (a) => a.type === "PENDING_STYLEBOARD",
      );
      expect(styleboardAction?.status).toBe("OPEN");

      const allMsgs = await getMessages(ctx.session.id);
      expect(
        allMsgs.some((m) => m.system_template === "FEEDBACK_MOODBOARD_LOVE"),
      ).toBe(true);

      await stylistCtx.close();
      await clientCtx.close();
    } finally {
      await ctx.cleanup();
    }
  });

  test("styleboard revise flow grants a bonus board and carries parent", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const ctx = await setupBoardSession("styleboard");
    try {
      const stylistCtx = await browser.newContext();
      const stylistPage = await stylistCtx.newPage();
      await stylistPage.goto("/sign-in");
      await stylistPage.getByLabel("Email").fill(ctx.stylist.email);
      await stylistPage.getByRole("button", { name: "Sign In" }).click();
      await expect(stylistPage).toHaveURL(/\/(sessions|stylist)/);

      // Create styleboard
      const createRes = await stylistPage.request.post("/api/styleboards", {
        data: { sessionId: ctx.session.id },
      });
      expect(createRes.status()).toBe(201);
      const board = await createRes.json();

      // Add 3 web-added items (mix of sources — web is the simplest to seed)
      for (let i = 0; i < 3; i++) {
        const addRes = await stylistPage.request.post(
          `/api/styleboards/${board.id}/items`,
          {
            data: {
              source: "WEB_ADDED",
              webItemUrl: `https://example.com/item-${i}`,
              webItemTitle: `Item ${i}`,
              webItemBrand: "TestBrand",
              webItemPriceInCents: 12000 + i * 1000,
              webItemImageUrl: `https://placehold.co/400x400/${i}${i}${i}/png`,
            },
          },
        );
        expect(addRes.status()).toBe(201);
      }

      // Send
      const sendRes = await stylistPage.request.post(
        `/api/styleboards/${board.id}/send`,
      );
      expect(sendRes.status()).toBe(200);

      await expect
        .poll(async () => (await getBoardItems(board.id)).length, { timeout: 10_000 })
        .toBe(3);

      // Client signs in and Revises with item feedback
      const clientCtx = await browser.newContext();
      const clientPage = await clientCtx.newPage();
      await clientPage.goto("/sign-in");
      await clientPage.getByLabel("Email").fill(ctx.client.email);
      await clientPage.getByRole("button", { name: "Sign In" }).click();
      await expect(clientPage).toHaveURL(/\/sessions/);

      const items = await getBoardItems(board.id);
      const rateRes = await clientPage.request.post(
        `/api/styleboards/${board.id}/feedback`,
        {
          data: {
            rating: "REVISE",
            itemFeedback: [
              {
                itemId: items[0].id,
                reaction: "REVISE",
                feedbackText: "wrong color",
                suggestedFeedback: ["Wrong color"],
              },
              {
                itemId: items[1].id,
                reaction: "REVISE",
                feedbackText: "too bold",
                suggestedFeedback: ["Too bold"],
              },
            ],
          },
        },
      );
      expect(rateRes.status()).toBe(200);
      const result = await rateRes.json();
      expect(result.restyleBoard).toBeTruthy();

      // Session bonusBoardsGranted++
      const session = await getSession(ctx.session.id);
      expect(session.bonus_boards_granted).toBe(1);

      // Child board exists with parent + isRevision
      const boards = await getBoards(ctx.session.id);
      const original = boards.find((b) => b.id === board.id)!;
      const child = boards.find((b) => b.parent_board_id === board.id);
      expect(original.rating).toBe("REVISE");
      expect(child).toBeTruthy();
      expect(child!.is_revision).toBe(true);

      // Per-item reactions + suggested feedback saved
      const updatedItems = await getBoardItems(board.id);
      expect(updatedItems[0].reaction).toBe("REVISE");
      expect(updatedItems[0].suggested_feedback).toContain("Wrong color");

      // PENDING_RESTYLE opened
      const actions = await getPendingActions(ctx.session.id);
      const restyle = actions.find((a) => a.type === "PENDING_RESTYLE");
      expect(restyle?.status).toBe("OPEN");
      expect(restyle?.board_id).toBe(child!.id);

      // System messages include RESTYLE_REQUESTED
      await expect
        .poll(
          async () => (await getMessages(ctx.session.id)).map((m) => m.system_template),
          { timeout: 10_000 },
        )
        .toContain("RESTYLE_REQUESTED");

      await stylistCtx.close();
      await clientCtx.close();
    } finally {
      await ctx.cleanup();
    }
  });

  test("inventory tab returns empty gracefully when INVENTORY_SERVICE_URL unreachable", async ({
    browser,
  }) => {
    test.setTimeout(45_000);
    const ctx = await setupBoardSession("invoff");
    try {
      const page = await (await browser.newContext()).newPage();
      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(ctx.stylist.email);
      await page.getByRole("button", { name: "Sign In" }).click();
      await expect(page).toHaveURL(/\/(sessions|stylist)/);

      const res = await page.request.get("/api/products?q=dress");
      expect(res.status()).toBe(200);
      const body = await res.json();
      // With the service down (or env unset in CI), we must return a valid
      // empty payload, not a 500.
      expect(body.results).toBeDefined();
      expect(Array.isArray(body.results)).toBe(true);
    } finally {
      await ctx.cleanup();
    }
  });
});
