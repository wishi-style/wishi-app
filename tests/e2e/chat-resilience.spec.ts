import { expect, test, type APIRequestContext } from "@playwright/test";
import Twilio from "twilio";
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

async function deleteTwilioConversation(channelSid: string | null) {
  if (!channelSid) return;
  try {
    await twilio()
      .conversations.v1.services(TWILIO_SERVICE)
      .conversations(channelSid)
      .remove();
  } catch (err) {
    console.warn("Twilio cleanup failed:", String(err));
  }
}

async function deleteConversationByUniqueName(uniqueName: string) {
  try {
    const fetched = await twilio()
      .conversations.v1.services(TWILIO_SERVICE)
      .conversations(uniqueName)
      .fetch();
    await twilio()
      .conversations.v1.services(TWILIO_SERVICE)
      .conversations(fetched.sid)
      .remove();
  } catch {
    // 404 — already gone, nothing to do
  }
}

async function getSessionChannelSid(sessionId: string): Promise<string | null> {
  const { rows } = await getPool().query(
    `SELECT twilio_channel_sid FROM sessions WHERE id = $1`,
    [sessionId],
  );
  return rows[0]?.twilio_channel_sid ?? null;
}

async function getMessages(sessionId: string) {
  const { rows } = await getPool().query(
    `SELECT id, kind, text, user_id, twilio_message_sid, system_template
     FROM messages WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId],
  );
  return rows;
}

async function signInE2E(api: APIRequestContext, email: string) {
  const res = await api.post("/sign-in", {
    form: { email, e2e: "1" },
    maxRedirects: 0,
  });
  expect([200, 302, 303, 307]).toContain(res.status());
}

interface Ctx {
  client: { id: string; clerkId: string; email: string };
  stylist: { id: string; clerkId: string; email: string };
  session: { id: string };
  uniqueName: string;
  cleanup: () => Promise<void>;
}

async function setup(prefix: string): Promise<Ctx> {
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const clientEmail = `${prefix}-c-${ts}@e2e.wishi.test`;
  const stylistEmail = `${prefix}-s-${ts}@e2e.wishi.test`;
  const clientClerkId = `e2e_${prefix}_c_${ts}`;
  const stylistClerkId = `e2e_${prefix}_s_${ts}`;

  const client = await ensureClientUser({
    clerkId: clientClerkId,
    email: clientEmail,
    firstName: "Resilience",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: stylistClerkId,
    email: stylistEmail,
    firstName: "Resilience",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
  });

  const uniqueName = `session-${session.id}`;

  return {
    client: { id: client.id, clerkId: clientClerkId, email: clientEmail },
    stylist: { id: stylist.id, clerkId: stylistClerkId, email: stylistEmail },
    session: { id: session.id },
    uniqueName,
    cleanup: async () => {
      await deleteConversationByUniqueName(uniqueName);
      await getPool().query(`DELETE FROM messages WHERE session_id = $1`, [session.id]);
      await cleanupStylistProfile(stylist.id);
      await cleanupE2EUserByEmail(clientEmail);
      await cleanupE2EUserByEmail(stylistEmail);
    },
  };
}

test.afterAll(async () => {
  await disconnectTestDb();
});

test.describe("Chat resilience: createChatConversation + inline mirror", () => {
  // -------------------------------------------------------------------------
  // Self-heal: twilioChannelSid=null → first send recovers
  // -------------------------------------------------------------------------

  test("self-heals null twilioChannelSid on first send and persists message", async ({
    request,
  }) => {
    test.setTimeout(60_000);
    const ctx = await setup("selfheal");

    try {
      expect(await getSessionChannelSid(ctx.session.id)).toBeNull();

      await signInE2E(request, ctx.client.email);
      const sendRes = await request.post(`/api/sessions/${ctx.session.id}/messages`, {
        data: { kind: "TEXT", body: "self-heal probe" },
      });
      expect(sendRes.status()).toBe(200);

      const sidAfter = await getSessionChannelSid(ctx.session.id);
      expect(sidAfter).toMatch(/^CH/);

      // Twilio conversation now exists by uniqueName
      const fetched = await twilio()
        .conversations.v1.services(TWILIO_SERVICE)
        .conversations(ctx.uniqueName)
        .fetch();
      expect(fetched.sid).toBe(sidAfter);

      // Inline mirror wrote the user message synchronously; webhook will
      // (eventually) write the welcome. Poll briefly for both rows.
      await expect
        .poll(() => getMessages(ctx.session.id).then((m) => m.length), {
          timeout: 15_000,
        })
        .toBeGreaterThanOrEqual(2);

      const msgs = await getMessages(ctx.session.id);
      const userMsg = msgs.find((m) => m.kind === "TEXT" && m.text === "self-heal probe");
      const welcome = msgs.find(
        (m) => m.kind === "SYSTEM_AUTOMATED" && m.system_template === "WELCOME",
      );
      expect(userMsg).toBeTruthy();
      expect(userMsg!.user_id).toBe(ctx.client.id);
      expect(userMsg!.twilio_message_sid).toMatch(/^IM/);
      expect(welcome).toBeTruthy();
    } finally {
      await ctx.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // Orphan reuse: Twilio conversation already exists with same uniqueName
  // (simulates a partial create that crashed before writing twilioChannelSid)
  // -------------------------------------------------------------------------

  test("recovers from orphaned Twilio conversation (no 50027 uniqueName conflict)", async ({
    request,
  }) => {
    test.setTimeout(60_000);
    const ctx = await setup("orphan");

    // Pre-create the orphan: Twilio conversation exists, DB has no SID,
    // no participants attached. This is the exact half-state that broke
    // staging on 2026-05-06.
    const orphan = await twilio()
      .conversations.v1.services(TWILIO_SERVICE)
      .conversations.create({
        friendlyName: `Orphan Session ${ctx.session.id}`,
        uniqueName: ctx.uniqueName,
      });

    try {
      expect(await getSessionChannelSid(ctx.session.id)).toBeNull();

      await signInE2E(request, ctx.client.email);
      const sendRes = await request.post(`/api/sessions/${ctx.session.id}/messages`, {
        data: { kind: "TEXT", body: "orphan recovery probe" },
      });
      // The original bug: this would 500 with Twilio 50027 because
      // createChatConversation tried to create a fresh conversation with
      // the same uniqueName. Recovery should reuse the orphan instead.
      expect(sendRes.status()).toBe(200);

      const sidAfter = await getSessionChannelSid(ctx.session.id);
      expect(sidAfter).toBe(orphan.sid);

      // Recovery skips the welcome to avoid duplicating it on a previously
      // created conversation. Only the user message should be in the DB.
      await expect
        .poll(() => getMessages(ctx.session.id).then((m) => m.length), {
          timeout: 15_000,
        })
        .toBeGreaterThanOrEqual(1);
      const msgs = await getMessages(ctx.session.id);
      const userMsg = msgs.find((m) => m.text === "orphan recovery probe");
      expect(userMsg).toBeTruthy();
      const welcomeCount = msgs.filter(
        (m) => m.system_template === "WELCOME",
      ).length;
      expect(welcomeCount).toBe(0);

      // Both participants got attached idempotently
      const participants = await twilio()
        .conversations.v1.services(TWILIO_SERVICE)
        .conversations(orphan.sid)
        .participants.list();
      const identities = participants
        .map((p) => p.identity)
        .filter(Boolean)
        .sort();
      expect(identities).toContain(ctx.client.clerkId);
      expect(identities).toContain(ctx.stylist.clerkId);
    } finally {
      await deleteTwilioConversation(orphan.sid);
      await ctx.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // Inline mirror: Message row exists synchronously after send returns,
  // proving the inline write happened (no webhook race involved).
  // -------------------------------------------------------------------------

  test("inline mirror writes Message row synchronously, before any webhook fires", async ({
    request,
  }) => {
    test.setTimeout(60_000);
    const ctx = await setup("inlinemirror");

    try {
      await signInE2E(request, ctx.client.email);

      // First send self-heals + creates conversation. Wait for that to
      // settle — we only want to measure subsequent send timing.
      const seedRes = await request.post(`/api/sessions/${ctx.session.id}/messages`, {
        data: { kind: "TEXT", body: "seed" },
      });
      expect(seedRes.status()).toBe(200);

      const sentText = `inline mirror probe ${Date.now()}`;
      const sendRes = await request.post(`/api/sessions/${ctx.session.id}/messages`, {
        data: { kind: "TEXT", body: sentText },
      });
      expect(sendRes.status()).toBe(200);

      // The moment the POST resolves, the Message row MUST exist — the
      // inline mirror writes it before sendTwilioMessage returns. If only
      // the webhook were responsible, this query would race and fail.
      const { rows } = await getPool().query(
        `SELECT kind, text, twilio_message_sid FROM messages
         WHERE session_id = $1 AND text = $2`,
        [ctx.session.id, sentText],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].kind).toBe("TEXT");
      expect(rows[0].twilio_message_sid).toMatch(/^IM/);
    } finally {
      await ctx.cleanup();
    }
  });
});
