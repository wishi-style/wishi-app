import { expect, test } from "@playwright/test";
import Twilio from "twilio";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  createSessionForClient,
  createStyleProfileFixture,
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

async function provisionTwilioConversation(
  sessionId: string,
  clientClerkId: string,
  stylistClerkId: string,
) {
  const client = twilio();
  const conv = await client.conversations.v1
    .services(TWILIO_SERVICE)
    .conversations.create({
      friendlyName: `E2E Session ${sessionId}`,
      uniqueName: `session-${sessionId}`,
    });
  await Promise.all([
    client.conversations.v1.services(TWILIO_SERVICE).conversations(conv.sid).participants.create({ identity: clientClerkId }),
    client.conversations.v1.services(TWILIO_SERVICE).conversations(conv.sid).participants.create({ identity: stylistClerkId }),
  ]);
  await getPool().query(
    `UPDATE sessions SET twilio_channel_sid = $1 WHERE id = $2`,
    [conv.sid, sessionId],
  );
  return conv.sid;
}

async function cleanupTwilioConversation(sid: string | null) {
  if (!sid) return;
  try {
    await twilio().conversations.v1.services(TWILIO_SERVICE).conversations(sid).remove();
  } catch {
    // ignore
  }
}

async function getSession(sessionId: string) {
  const { rows } = await getPool().query(
    `SELECT * FROM sessions WHERE id = $1`,
    [sessionId],
  );
  return rows[0];
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
    `SELECT kind, system_template FROM messages WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId],
  );
  return rows;
}

test.afterAll(async () => {
  await disconnectTestDb();
});

async function setupCtx(
  prefix: string,
  opts: { withStyleProfile?: boolean; status?: string } = {},
) {
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const clientEmail = `${prefix}-c-${ts}@e2e.wishi.test`;
  const stylistEmail = `${prefix}-s-${ts}@e2e.wishi.test`;
  const clientClerkId = `e2e_${prefix}_c_${ts}`;
  const stylistClerkId = `e2e_${prefix}_s_${ts}`;

  const client = await ensureClientUser({
    clerkId: clientClerkId,
    email: clientEmail,
    firstName: "End",
    lastName: "Client",
  });
  if (opts.withStyleProfile) {
    await createStyleProfileFixture(client.id);
  }
  const stylist = await ensureStylistUser({
    clerkId: stylistClerkId,
    email: stylistEmail,
    firstName: "End",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: opts.status ?? "ACTIVE",
    planType: "MINI",
  });
  const channelSid = await provisionTwilioConversation(
    session.id,
    clientClerkId,
    stylistClerkId,
  );

  return {
    client: { id: client.id, email: clientEmail },
    stylist: { id: stylist.id, email: stylistEmail },
    session: { id: session.id },
    channelSid,
    cleanup: async () => {
      await cleanupTwilioConversation(channelSid);
      const p = getPool();
      await p.query(`DELETE FROM messages WHERE session_id = $1`, [session.id]);
      await p.query(
        `DELETE FROM session_pending_actions WHERE session_id = $1`,
        [session.id],
      );
      await cleanupStylistProfile(stylist.id);
      await cleanupE2EUserByEmail(clientEmail);
      await cleanupE2EUserByEmail(stylistEmail);
    },
  };
}

test.describe("Phase 4: end-session", () => {
  test("decline round-trip: stylist requests → client declines → session back to ACTIVE", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const ctx = await setupCtx("decline");
    try {
      // Stylist requests end
      const stylistCtx = await browser.newContext();
      const stylistPage = await stylistCtx.newPage();
      await stylistPage.goto("/sign-in");
      await stylistPage.getByLabel("Email").fill(ctx.stylist.email);
      await stylistPage.getByRole("button", { name: "Sign In" }).click();
      await expect(stylistPage).not.toHaveURL(/\/sign-in/);

      const reqRes = await stylistPage.request.post(
        `/api/sessions/${ctx.session.id}/end/request`,
      );
      expect(reqRes.status()).toBe(200);

      const afterRequest = await getSession(ctx.session.id);
      expect(afterRequest.status).toBe("PENDING_END_APPROVAL");
      expect(afterRequest.end_requested_at).not.toBeNull();
      expect(afterRequest.end_approval_deadline).not.toBeNull();

      // Client declines
      const clientCtx = await browser.newContext();
      const clientPage = await clientCtx.newPage();
      await clientPage.goto("/sign-in");
      await clientPage.getByLabel("Email").fill(ctx.client.email);
      await clientPage.getByRole("button", { name: "Sign In" }).click();
      await expect(clientPage).toHaveURL(/\/sessions/);

      const declineRes = await clientPage.request.post(
        `/api/sessions/${ctx.session.id}/end/decline`,
      );
      expect(declineRes.status()).toBe(200);

      const afterDecline = await getSession(ctx.session.id);
      expect(afterDecline.status).toBe("ACTIVE");

      // PENDING_END_APPROVAL resolved, PENDING_STYLIST_RESPONSE opened
      const actions = await getPendingActions(ctx.session.id);
      const approval = actions.find((a) => a.type === "PENDING_END_APPROVAL");
      const response = actions.find((a) => a.type === "PENDING_STYLIST_RESPONSE");
      expect(approval?.status).toBe("RESOLVED");
      expect(response?.status).toBe("OPEN");

      // END_SESSION_REQUESTED + END_SESSION_DECLINED system messages fired
      await expect
        .poll(
          async () => (await getMessages(ctx.session.id)).map((m) => m.system_template),
          { timeout: 10_000 },
        )
        .toEqual(
          expect.arrayContaining(["END_SESSION_REQUESTED", "END_SESSION_DECLINED"]),
        );

      await stylistCtx.close();
      await clientCtx.close();
    } finally {
      await ctx.cleanup();
    }
  });

  test("approve: stylist requests → client approves → session COMPLETED + redirect page reachable", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const ctx = await setupCtx("approve");
    try {
      const stylistCtx = await browser.newContext();
      const stylistPage = await stylistCtx.newPage();
      await stylistPage.goto("/sign-in");
      await stylistPage.getByLabel("Email").fill(ctx.stylist.email);
      await stylistPage.getByRole("button", { name: "Sign In" }).click();
      await expect(stylistPage).not.toHaveURL(/\/sign-in/);

      await stylistPage.request.post(`/api/sessions/${ctx.session.id}/end/request`);

      const clientCtx = await browser.newContext();
      const clientPage = await clientCtx.newPage();
      await clientPage.goto("/sign-in");
      await clientPage.getByLabel("Email").fill(ctx.client.email);
      await clientPage.getByRole("button", { name: "Sign In" }).click();
      await expect(clientPage).toHaveURL(/\/sessions/);

      const approveRes = await clientPage.request.post(
        `/api/sessions/${ctx.session.id}/end/approve`,
      );
      expect(approveRes.status()).toBe(200);

      const s = await getSession(ctx.session.id);
      expect(s.status).toBe("COMPLETED");
      expect(s.completed_at).not.toBeNull();

      // End-session page now shows the real tip/rate/review UI (Phase 6).
      // Session.rating is null because we approved via the API, not the form,
      // so we expect the "Wrap up your session" heading, not the
      // "Thanks for the feedback" post-submit confirmation.
      const endPage = await clientCtx.newPage();
      await endPage.goto(`/sessions/${ctx.session.id}/end-session`);
      await expect(endPage.getByRole("heading", { name: "Wrap up your session" })).toBeVisible();

      await stylistCtx.close();
      await clientCtx.close();
    } finally {
      await ctx.cleanup();
    }
  });

  // ----- Wrap modal: the "That's a Wrap" popup that surfaces in the client's
  // chat once the stylist requests end (Session.status = PENDING_END_APPROVAL).
  // Each CTA gets a focused test driving the real UI buttons.

  test("wrap modal: I'm Done approves the session and redirects to /end-session", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const ctx = await setupCtx("wrap-done", {
      withStyleProfile: true,
      status: "PENDING_END_APPROVAL",
    });
    try {
      // Open the request so the modal predicate is satisfied. We hit the API
      // directly here — the dashboard-driven path is covered separately below.
      const stylistCtx = await browser.newContext();
      const stylistPage = await stylistCtx.newPage();
      await stylistPage.goto("/sign-in");
      await stylistPage.getByLabel("Email").fill(ctx.stylist.email);
      await stylistPage.getByRole("button", { name: "Sign In" }).click();
      await stylistPage.request.post(`/api/sessions/${ctx.session.id}/end/request`);

      const clientCtx = await browser.newContext();
      const clientPage = await clientCtx.newPage();
      await clientPage.goto("/sign-in");
      await clientPage.getByLabel("Email").fill(ctx.client.email);
      await clientPage.getByRole("button", { name: "Sign In" }).click();
      await clientPage.goto(`/sessions/${ctx.session.id}/chat`);

      await expect(
        clientPage.getByRole("heading", { name: "That's a Wrap" }),
      ).toBeVisible();
      await expect(clientPage.getByText("Session Complete")).toBeVisible();

      await clientPage.getByRole("button", { name: "I'm Done" }).click();
      await expect(clientPage).toHaveURL(
        new RegExp(`/sessions/${ctx.session.id}/end-session`),
      );

      const s = await getSession(ctx.session.id);
      expect(s.status).toBe("COMPLETED");

      await stylistCtx.close();
      await clientCtx.close();
    } finally {
      await ctx.cleanup();
    }
  });

  test("wrap modal: Add Looks declines the end request and opens Buy Looks", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const ctx = await setupCtx("wrap-add", {
      withStyleProfile: true,
      status: "PENDING_END_APPROVAL",
    });
    try {
      const stylistCtx = await browser.newContext();
      const stylistPage = await stylistCtx.newPage();
      await stylistPage.goto("/sign-in");
      await stylistPage.getByLabel("Email").fill(ctx.stylist.email);
      await stylistPage.getByRole("button", { name: "Sign In" }).click();
      await stylistPage.request.post(`/api/sessions/${ctx.session.id}/end/request`);

      const clientCtx = await browser.newContext();
      const clientPage = await clientCtx.newPage();
      await clientPage.goto("/sign-in");
      await clientPage.getByLabel("Email").fill(ctx.client.email);
      await clientPage.getByRole("button", { name: "Sign In" }).click();
      await clientPage.goto(`/sessions/${ctx.session.id}/chat`);

      await expect(
        clientPage.getByRole("heading", { name: "That's a Wrap" }),
      ).toBeVisible();
      await clientPage.getByRole("button", { name: "Add Looks" }).click();

      // BuyLooksDialog takes over.
      await expect(
        clientPage.getByRole("heading", { name: "Buy More Looks" }),
      ).toBeVisible();

      // Session was declined back to ACTIVE in the same gesture.
      await expect
        .poll(async () => (await getSession(ctx.session.id)).status, {
          timeout: 5_000,
        })
        .toBe("ACTIVE");

      await stylistCtx.close();
      await clientCtx.close();
    } finally {
      await ctx.cleanup();
    }
  });

  test("wrap modal: Back to chat dismisses without mutating session state", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const ctx = await setupCtx("wrap-back", {
      withStyleProfile: true,
      status: "PENDING_END_APPROVAL",
    });
    try {
      const stylistCtx = await browser.newContext();
      const stylistPage = await stylistCtx.newPage();
      await stylistPage.goto("/sign-in");
      await stylistPage.getByLabel("Email").fill(ctx.stylist.email);
      await stylistPage.getByRole("button", { name: "Sign In" }).click();
      await stylistPage.request.post(`/api/sessions/${ctx.session.id}/end/request`);

      const clientCtx = await browser.newContext();
      const clientPage = await clientCtx.newPage();
      await clientPage.goto("/sign-in");
      await clientPage.getByLabel("Email").fill(ctx.client.email);
      await clientPage.getByRole("button", { name: "Sign In" }).click();
      await clientPage.goto(`/sessions/${ctx.session.id}/chat`);

      await expect(
        clientPage.getByRole("heading", { name: "That's a Wrap" }),
      ).toBeVisible();
      await clientPage.getByRole("button", { name: "Back to chat" }).click();

      // Heading disappears, session remains PENDING_END_APPROVAL.
      await expect(
        clientPage.getByRole("heading", { name: "That's a Wrap" }),
      ).toBeHidden();
      const s = await getSession(ctx.session.id);
      expect(s.status).toBe("PENDING_END_APPROVAL");

      await stylistCtx.close();
      await clientCtx.close();
    } finally {
      await ctx.cleanup();
    }
  });
});
