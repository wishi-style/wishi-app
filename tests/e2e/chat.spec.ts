import { expect, test, type Page } from "@playwright/test";
import Twilio from "twilio";
import crypto from "node:crypto";
import path from "node:path";
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

// ---------------------------------------------------------------------------
// Twilio helpers
// ---------------------------------------------------------------------------

const TWILIO_SERVICE = process.env.TWILIO_CONVERSATIONS_SERVICE_SID!;

function twilio() {
  return Twilio(
    process.env.TWILIO_API_KEY_SID!,
    process.env.TWILIO_API_KEY_SECRET!,
    { accountSid: process.env.TWILIO_ACCOUNT_SID! },
  );
}

interface SendOpts {
  author: string;
  body?: string;
  attributes?: Record<string, unknown>;
}

async function sendTwilioMessage(channelSid: string, opts: SendOpts) {
  return twilio()
    .conversations.v1.services(TWILIO_SERVICE)
    .conversations(channelSid)
    .messages.create({
      author: opts.author,
      body: opts.body ?? "",
      attributes: opts.attributes ? JSON.stringify(opts.attributes) : undefined,
      xTwilioWebhookEnabled: "true",
    });
}

async function provisionTwilioConversation(opts: {
  sessionId: string;
  clientClerkId: string;
  stylistClerkId: string;
  withWelcome?: boolean;
}): Promise<string> {
  const client = twilio();

  // Must match the uniqueName the useChat hook looks up: `session-${sessionId}`
  const conversation = await client.conversations.v1
    .services(TWILIO_SERVICE)
    .conversations.create({
      friendlyName: `E2E Session ${opts.sessionId}`,
      uniqueName: `session-${opts.sessionId}`,
    });

  await Promise.all([
    client.conversations.v1
      .services(TWILIO_SERVICE)
      .conversations(conversation.sid)
      .participants.create({ identity: opts.clientClerkId }),
    client.conversations.v1
      .services(TWILIO_SERVICE)
      .conversations(conversation.sid)
      .participants.create({ identity: opts.stylistClerkId }),
  ]);

  await getPool().query(
    `UPDATE sessions SET twilio_channel_sid = $1 WHERE id = $2`,
    [conversation.sid, opts.sessionId],
  );

  if (opts.withWelcome !== false) {
    await sendTwilioMessage(conversation.sid, {
      author: "system",
      body: "Welcome to Wishi! Your stylist is ready to help.",
      attributes: { kind: "SYSTEM_AUTOMATED", systemTemplate: "WELCOME" },
    });
  }

  return conversation.sid;
}

async function cleanupTwilioConversation(channelSid: string | null) {
  if (!channelSid) return;
  try {
    await twilio()
      .conversations.v1.services(TWILIO_SERVICE)
      .conversations(channelSid)
      .remove();
  } catch (err) {
    console.warn("Twilio cleanup failed (may already be deleted):", String(err));
  }
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function getMessageCount(sessionId: string): Promise<number> {
  const { rows } = await getPool().query(
    `SELECT COUNT(*)::int AS n FROM messages WHERE session_id = $1`,
    [sessionId],
  );
  return rows[0].n;
}

async function getMessages(sessionId: string) {
  const { rows } = await getPool().query(
    `SELECT id, kind, text, user_id, twilio_message_sid, system_template,
            media_url, media_s3_key, board_id, single_item_inventory_product_id,
            single_item_web_url
     FROM messages WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId],
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Browser helpers
// ---------------------------------------------------------------------------

async function signInAs(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/sessions/);
}

// ---------------------------------------------------------------------------
// Per-test setup / teardown
// ---------------------------------------------------------------------------

interface ChatCtx {
  client: { id: string; clerkId: string; email: string };
  stylist: { id: string; clerkId: string; email: string };
  session: { id: string };
  channelSid: string;
  cleanup: () => Promise<void>;
}

async function setupChatSession({
  status = "ACTIVE",
  withWelcome = true,
  prefix = "chat",
}: {
  status?: "ACTIVE" | "BOOKED" | "COMPLETED";
  withWelcome?: boolean;
  prefix?: string;
} = {}): Promise<ChatCtx> {
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const clientEmail = `${prefix}-client-${ts}@e2e.wishi.test`;
  const stylistEmail = `${prefix}-stylist-${ts}@e2e.wishi.test`;
  const clientClerkId = `e2e_${prefix}_client_${ts}`;
  const stylistClerkId = `e2e_${prefix}_stylist_${ts}`;

  const client = await ensureClientUser({
    clerkId: clientClerkId,
    email: clientEmail,
    firstName: "Chat",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: stylistClerkId,
    email: stylistEmail,
    firstName: "Chat",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status,
  });

  let channelSid = "";
  // BOOKED sessions skip Twilio provisioning to mirror the production state
  // (createChatConversation only fires on the BOOKED→ACTIVE transition).
  if (status === "ACTIVE") {
    channelSid = await provisionTwilioConversation({
      sessionId: session.id,
      clientClerkId,
      stylistClerkId,
      withWelcome,
    });
  }

  return {
    client: { id: client.id, clerkId: clientClerkId, email: clientEmail },
    stylist: { id: stylist.id, clerkId: stylistClerkId, email: stylistEmail },
    session: { id: session.id },
    channelSid,
    cleanup: async () => {
      await cleanupTwilioConversation(channelSid || null);
      await getPool().query(`DELETE FROM messages WHERE session_id = $1`, [session.id]);
      await cleanupStylistProfile(stylist.id);
      await cleanupE2EUserByEmail(clientEmail);
      await cleanupE2EUserByEmail(stylistEmail);
    },
  };
}

// ---------------------------------------------------------------------------
// Twilio webhook signature (matches the spec at
// https://www.twilio.com/docs/usage/security)
// ---------------------------------------------------------------------------

function getTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  const sortedConcat = Object.keys(params)
    .sort()
    .map((k) => k + params[k])
    .join("");
  return crypto
    .createHmac("sha1", authToken)
    .update(url + sortedConcat)
    .digest("base64");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.afterAll(async () => {
  await disconnectTestDb();
});

test.describe("Phase 3: Real-time chat", () => {
  // -------------------------------------------------------------------------
  // Core flow
  // -------------------------------------------------------------------------

  test("client + stylist exchange messages in real-time, system WELCOME persists", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const ctx = await setupChatSession();
    try {
      await expect
        .poll(() => getMessageCount(ctx.session.id), { timeout: 15_000, intervals: [500] })
        .toBe(1);

      const seedMsgs = await getMessages(ctx.session.id);
      expect(seedMsgs[0].kind).toBe("SYSTEM_AUTOMATED");
      expect(seedMsgs[0].system_template).toBe("WELCOME");

      const clientCtx = await browser.newContext();
      const stylistCtx = await browser.newContext();
      const clientPage = await clientCtx.newPage();
      const stylistPage = await stylistCtx.newPage();

      await signInAs(clientPage, ctx.client.email);
      await signInAs(stylistPage, ctx.stylist.email);

      await clientPage.goto(`/sessions/${ctx.session.id}/chat`);
      await stylistPage.goto(`/stylist/sessions/${ctx.session.id}/chat`);

      await expect(
        clientPage.getByText("Welcome to Wishi! Your stylist is ready to help."),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        stylistPage.getByText("Welcome to Wishi! Your stylist is ready to help."),
      ).toBeVisible({ timeout: 15_000 });

      const clientInput = clientPage.getByPlaceholder("Type a message...");
      const stylistInput = stylistPage.getByPlaceholder("Type a message...");
      await expect(clientInput).toBeEnabled({ timeout: 15_000 });
      await expect(stylistInput).toBeEnabled({ timeout: 15_000 });

      const clientMsg = `Hello from client ${Date.now()}`;
      await clientInput.fill(clientMsg);
      await clientPage.getByRole("button", { name: "Send message" }).click();
      await expect(stylistPage.getByText(clientMsg)).toBeVisible({ timeout: 10_000 });
      await expect(clientPage.getByText(clientMsg)).toBeVisible({ timeout: 5_000 });

      const stylistMsg = `Hi back from stylist ${Date.now()}`;
      await stylistInput.fill(stylistMsg);
      await stylistPage.getByRole("button", { name: "Send message" }).click();
      await expect(clientPage.getByText(stylistMsg)).toBeVisible({ timeout: 10_000 });
      await expect(stylistPage.getByText(stylistMsg)).toBeVisible({ timeout: 5_000 });

      await expect
        .poll(() => getMessageCount(ctx.session.id), { timeout: 15_000, intervals: [500] })
        .toBe(3);

      const allMsgs = await getMessages(ctx.session.id);
      expect(allMsgs.map((m) => m.kind)).toEqual([
        "SYSTEM_AUTOMATED",
        "TEXT",
        "TEXT",
      ]);
      expect(allMsgs[1].text).toBe(clientMsg);
      expect(allMsgs[2].text).toBe(stylistMsg);
      expect(allMsgs[0].user_id).toBeNull();
      expect(allMsgs[1].user_id).toBe(ctx.client.id);
      expect(allMsgs[2].user_id).toBe(ctx.stylist.id);

      const sids = allMsgs.map((m) => m.twilio_message_sid);
      expect(new Set(sids).size).toBe(3);
      for (const sid of sids) expect(sid).toMatch(/^IM/);

      await clientCtx.close();
      await stylistCtx.close();
    } finally {
      await ctx.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // Placeholder cards (Phase 4/5/6 surface area lives here)
  // -------------------------------------------------------------------------

  test("placeholder kinds render correctly: PHOTO, MOODBOARD, STYLEBOARD, RESTYLE, SINGLE_ITEM, END_SESSION_REQUEST", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const ctx = await setupChatSession({ prefix: "renderkinds" });
    try {
      await expect
        .poll(() => getMessageCount(ctx.session.id), { timeout: 15_000 })
        .toBe(1); // welcome

      // Send one message of each kind
      await sendTwilioMessage(ctx.channelSid, {
        author: ctx.stylist.clerkId,
        body: "",
        attributes: {
          kind: "PHOTO",
          mediaUrl: "https://placehold.co/600x400/png",
        },
      });
      await sendTwilioMessage(ctx.channelSid, {
        author: ctx.stylist.clerkId,
        attributes: { kind: "MOODBOARD", boardId: "moodboard-test-1" },
      });
      await sendTwilioMessage(ctx.channelSid, {
        author: ctx.stylist.clerkId,
        attributes: { kind: "STYLEBOARD", boardId: "styleboard-test-1" },
      });
      await sendTwilioMessage(ctx.channelSid, {
        author: ctx.client.clerkId,
        attributes: { kind: "RESTYLE", boardId: "styleboard-test-1" },
      });
      await sendTwilioMessage(ctx.channelSid, {
        author: ctx.stylist.clerkId,
        attributes: {
          kind: "SINGLE_ITEM",
          singleItemInventoryProductId: "inv_test_123",
          singleItemWebUrl: "https://example.com/item/123",
        },
      });
      await sendTwilioMessage(ctx.channelSid, {
        author: ctx.client.clerkId,
        attributes: { kind: "END_SESSION_REQUEST" },
      });

      // Wait for all 7 messages (welcome + 6 new) in DB
      await expect
        .poll(() => getMessageCount(ctx.session.id), { timeout: 20_000 })
        .toBe(7);

      const msgs = await getMessages(ctx.session.id);
      const kinds = msgs.map((m) => m.kind);
      expect(kinds).toEqual([
        "SYSTEM_AUTOMATED",
        "PHOTO",
        "MOODBOARD",
        "STYLEBOARD",
        "RESTYLE",
        "SINGLE_ITEM",
        "END_SESSION_REQUEST",
      ]);

      // Verify metadata persistence
      const photo = msgs.find((m) => m.kind === "PHOTO")!;
      expect(photo.media_url).toBe("https://placehold.co/600x400/png");

      const moodboard = msgs.find((m) => m.kind === "MOODBOARD")!;
      expect(moodboard.board_id).toBe("moodboard-test-1");

      const singleItem = msgs.find((m) => m.kind === "SINGLE_ITEM")!;
      expect(singleItem.single_item_inventory_product_id).toBe("inv_test_123");
      expect(singleItem.single_item_web_url).toBe("https://example.com/item/123");

      // Verify the chat UI renders each kind
      const browserCtx = await browser.newContext();
      const page = await browserCtx.newPage();
      await signInAs(page, ctx.client.email);
      await page.goto(`/sessions/${ctx.session.id}/chat`);

      // PHOTO renders as <img>
      await expect(page.locator(`img[src="https://placehold.co/600x400/png"]`)).toBeVisible({
        timeout: 15_000,
      });

      // Board cards show 🎨/✨/🔄 and label
      await expect(page.getByText("Moodboard", { exact: true })).toBeVisible();
      await expect(page.getByText("Styleboard", { exact: true })).toBeVisible();
      await expect(page.getByText("Restyle", { exact: true })).toBeVisible();

      // Single item card shows 👗 + product link (prefers inventory id)
      await expect(page.getByText("Product Suggestion")).toBeVisible();
      await expect(page.getByRole("link", { name: "View product" })).toHaveAttribute(
        "href",
        "/products/inv_test_123",
      );

      // End-session card now renders Approve/Decline CTAs for the client
      await expect(page.getByText("Session end requested")).toBeVisible();
      await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Decline" })).toBeVisible();

      await browserCtx.close();
    } finally {
      await ctx.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // Authorization
  // -------------------------------------------------------------------------

  test("non-participant cannot access another user's chat (404)", async ({
    browser,
  }) => {
    test.setTimeout(45_000);
    const ctx = await setupChatSession({ prefix: "authz" });
    const ts = Date.now();
    const outsiderEmail = `outsider-${ts}@e2e.wishi.test`;
    await ensureClientUser({
      clerkId: `e2e_authz_outsider_${ts}`,
      email: outsiderEmail,
      firstName: "Outsider",
      lastName: "User",
    });

    try {
      const browserCtx = await browser.newContext();
      const page = await browserCtx.newPage();
      await signInAs(page, outsiderEmail);
      const response = await page.goto(`/sessions/${ctx.session.id}/chat`);
      expect(response?.status()).toBe(404);

      await browserCtx.close();
    } finally {
      await cleanupE2EUserByEmail(outsiderEmail);
      await ctx.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // Session status filtering
  // -------------------------------------------------------------------------

  test("BOOKED session redirects /chat back to /sessions/[id]", async ({ browser }) => {
    test.setTimeout(45_000);
    // BOOKED status → no Twilio provisioning, no twilio_channel_sid
    const ctx = await setupChatSession({ status: "BOOKED", prefix: "status" });

    try {
      const browserCtx = await browser.newContext();
      const page = await browserCtx.newPage();
      await signInAs(page, ctx.client.email);
      await page.goto(`/sessions/${ctx.session.id}/chat`);
      // Either status check or twilioChannelSid null check redirects to session page
      await expect(page).toHaveURL(new RegExp(`/sessions/${ctx.session.id}$`));

      await browserCtx.close();
    } finally {
      await ctx.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // Webhook idempotency
  // -------------------------------------------------------------------------

  test("webhook is idempotent on retried delivery (same MessageSid → 1 row)", async () => {
    test.setTimeout(45_000);
    const ctx = await setupChatSession({ prefix: "idem", withWelcome: false });

    try {
      // Send a real text message via Twilio (webhook fires once → 1 row)
      const sent = await sendTwilioMessage(ctx.channelSid, {
        author: ctx.client.clerkId,
        body: "idempotency probe",
        attributes: { kind: "TEXT" },
      });

      await expect
        .poll(() => getMessageCount(ctx.session.id), { timeout: 15_000 })
        .toBe(1);

      // Forge a webhook redelivery with the same MessageSid + valid signature.
      // Twilio normally retries on 5xx; we simulate that explicitly here.
      const webhookUrl = process.env.TWILIO_WEBHOOK_URL!;
      const params: Record<string, string> = {
        EventType: "onMessageAdded",
        ConversationSid: ctx.channelSid,
        MessageSid: sent.sid,
        Author: ctx.client.clerkId,
        Body: "idempotency probe",
        Attributes: JSON.stringify({ kind: "TEXT" }),
        DateCreated: new Date().toISOString(),
      };
      const signature = getTwilioSignature(
        process.env.TWILIO_AUTH_TOKEN!,
        webhookUrl,
        params,
      );

      // Replay the webhook 3x — all should be 200 + idempotent
      for (let i = 0; i < 3; i++) {
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "x-twilio-signature": signature,
            "ngrok-skip-browser-warning": "true",
          },
          body: new URLSearchParams(params).toString(),
        });
        expect(res.status).toBe(200);
      }

      // Only 1 row should exist for the original MessageSid
      const final = await getMessages(ctx.session.id);
      expect(final).toHaveLength(1);
      expect(final[0].twilio_message_sid).toBe(sent.sid);
    } finally {
      await ctx.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // Push notifications API surface
  // -------------------------------------------------------------------------

  test("push subscribe API: 307 unauth, 400 invalid, 200 valid + DB row, vapid key endpoint", async ({
    browser,
  }) => {
    test.setTimeout(45_000);
    const ctx = await setupChatSession({ prefix: "push", withWelcome: false });

    try {
      const browserCtx = await browser.newContext();
      const page = await browserCtx.newPage();

      // Unauthenticated → 307 redirect to /sign-in (Clerk middleware blocks
      // before the route handler runs). maxRedirects: 0 stops Playwright
      // from auto-following the redirect, which would land on /sign-in (200).
      const unauthRes = await page.request.post("/api/push/subscribe", {
        data: { endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "x", auth: "y" } },
        maxRedirects: 0,
      });
      expect(unauthRes.status()).toBe(307);
      expect(unauthRes.headers()["location"]).toMatch(/\/sign-in/);

      // Sign in as the client
      await signInAs(page, ctx.client.email);

      // Invalid payload → 400
      const invalidRes = await page.request.post("/api/push/subscribe", {
        data: { endpoint: "https://fcm.googleapis.com/x" }, // missing keys
      });
      expect(invalidRes.status()).toBe(400);

      // Valid payload → 200 + DB row
      const endpoint = `https://fcm.googleapis.com/${ctx.client.clerkId}-${Date.now()}`;
      const validRes = await page.request.post("/api/push/subscribe", {
        data: { endpoint, keys: { p256dh: "p256-test", auth: "auth-test" } },
      });
      expect(validRes.status()).toBe(200);

      const { rows } = await getPool().query(
        `SELECT user_id, p256dh, auth FROM push_subscriptions WHERE endpoint = $1`,
        [endpoint],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].user_id).toBe(ctx.client.id);
      expect(rows[0].p256dh).toBe("p256-test");
      expect(rows[0].auth).toBe("auth-test");

      // Re-POST same endpoint → upsert (still 1 row, no duplicate)
      const upsertRes = await page.request.post("/api/push/subscribe", {
        data: { endpoint, keys: { p256dh: "p256-updated", auth: "auth-updated" } },
      });
      expect(upsertRes.status()).toBe(200);
      const { rows: rowsAfter } = await getPool().query(
        `SELECT p256dh, auth FROM push_subscriptions WHERE endpoint = $1`,
        [endpoint],
      );
      expect(rowsAfter).toHaveLength(1);
      expect(rowsAfter[0].p256dh).toBe("p256-updated");

      // VAPID public key endpoint exposes the configured public key
      const vapidRes = await page.request.get("/api/push/vapid-key");
      expect(vapidRes.status()).toBe(200);
      const { key } = await vapidRes.json();
      expect(key).toBe(process.env.VAPID_PUBLIC_KEY);

      // Cleanup push rows
      await getPool().query(`DELETE FROM push_subscriptions WHERE endpoint LIKE $1`, [
        `%${ctx.client.clerkId}%`,
      ]);

      await browserCtx.close();
    } finally {
      await ctx.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // Real S3 upload + PHOTO render (uses ~/.aws/credentials default profile)
  // -------------------------------------------------------------------------

  test("image upload: presigned URL → S3 PUT → PHOTO message renders", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const ctx = await setupChatSession({ prefix: "upload", withWelcome: false });

    try {
      const browserCtx = await browser.newContext();
      const page = await browserCtx.newPage();
      await signInAs(page, ctx.client.email);
      await page.goto(`/sessions/${ctx.session.id}/chat`);

      // Wait for chat to connect
      await expect(page.getByPlaceholder("Type a message...")).toBeEnabled({
        timeout: 15_000,
      });

      // Use Playwright's setInputFiles to upload a real image
      const fixturePath = path.join(
        process.cwd(),
        "tests/e2e/fixtures/chat-test-image.png",
      );
      await page.locator('input[type="file"]').setInputFiles(fixturePath);

      // Wait for the upload + Twilio message → DB persistence (1 PHOTO row)
      await expect
        .poll(() => getMessageCount(ctx.session.id), { timeout: 30_000, intervals: [500] })
        .toBe(1);

      const msgs = await getMessages(ctx.session.id);
      expect(msgs[0].kind).toBe("PHOTO");
      expect(msgs[0].media_url).toMatch(
        /^https:\/\/wishi-uploads-staging\.s3\..*\.amazonaws\.com\/chat\//,
      );
      expect(msgs[0].media_s3_key).toMatch(/^chat\//);

      // Image renders in chat UI
      await expect(page.locator(`img[src="${msgs[0].media_url}"]`)).toBeVisible({
        timeout: 15_000,
      });

      // Cleanup the S3 object so we don't litter the staging bucket
      const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });
      await s3.send(
        new DeleteObjectCommand({
          Bucket: process.env.S3_UPLOADS_BUCKET!,
          Key: msgs[0].media_s3_key,
        }),
      );

      await browserCtx.close();
    } finally {
      await ctx.cleanup();
    }
  });
});
