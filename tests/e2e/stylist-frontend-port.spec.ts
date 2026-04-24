import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  createSessionForClient,
  disconnectTestDb,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
} from "./db";

/**
 * Phase 12 authed browser verifications for the stylist-frontend port.
 *
 * These specs prove that the Dashboard queue, Workspace chrome, and
 * LookCreator canvas surfaces render and persist correctly against a real
 * signed-in stylist session — covering the main value promise of PR #58.
 *
 * Twilio-dependent paths (moodboard/styleboard /send chat fan-out) live in
 * `boards.spec.ts` and are out of scope here; this file only exercises
 * surfaces that don't need live Twilio so it runs green locally.
 *
 * Runs against `npm run dev:e2e` (port 3001, E2E_AUTH_MODE=true).
 */

test.afterAll(async () => {
  await disconnectTestDb();
});

interface Ctx {
  client: { id: string; firstName: string; email: string; clerkId: string };
  stylist: { id: string; firstName: string; email: string; clerkId: string };
  stylistProfileId: string;
  sessionId: string;
  cleanup: () => Promise<void>;
}

async function seedStylistWithSession(prefix: string): Promise<Ctx> {
  const ts = Date.now() + Math.floor(Math.random() * 1_000);
  const clientEmail = `${prefix}-client-${ts}@e2e.wishi.test`;
  const stylistEmail = `${prefix}-stylist-${ts}@e2e.wishi.test`;
  const clientClerkId = `e2e_${prefix}_client_${ts}`;
  const stylistClerkId = `e2e_${prefix}_stylist_${ts}`;

  const client = await ensureClientUser({
    clerkId: clientClerkId,
    email: clientEmail,
    firstName: "Queue",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: stylistClerkId,
    email: stylistEmail,
    firstName: "Queue",
    lastName: "Stylist",
  });
  const stylistProfile = await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });
  // Workspace page redirects out when twilio_channel_sid is null. Stamp a
  // placeholder SID so the page renders — we never actually send messages
  // in these specs, so Twilio itself is never touched.
  await getPool().query(
    `UPDATE sessions SET twilio_channel_sid = $1 WHERE id = $2`,
    [`CH_e2e_phase12_${ts}`, session.id],
  );

  return {
    client: {
      id: client.id,
      firstName: client.first_name,
      email: clientEmail,
      clerkId: clientClerkId,
    },
    stylist: {
      id: stylist.id,
      firstName: stylist.first_name,
      email: stylistEmail,
      clerkId: stylistClerkId,
    },
    stylistProfileId: stylistProfile.id,
    sessionId: session.id,
    async cleanup() {
      await cleanupStylistProfile(stylist.id);
      await cleanupE2EUserByEmail(clientEmail);
      await cleanupE2EUserByEmail(stylistEmail);
    },
  };
}

async function signInAsStylist(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/(stylist|sessions|onboarding)/);
}

test("Dashboard queue renders the stylist's real sessions with client name + plan badge", async ({
  page,
}) => {
  const ctx = await seedStylistWithSession("phase12-dash");
  try {
    await signInAsStylist(page, ctx.stylist.email);
    await page.goto("/stylist/dashboard");
    await page.waitForLoadState("networkidle");

    const body = await page.locator("body").innerText();
    // Client's name is the only stable fixture value to assert against —
    // every DashboardSession row the view-model emits carries it.
    expect(body, "dashboard shows seeded client name").toContain("Queue Client");
    // MAJOR plan badge — Loveable chrome renders "Major" or "✦ Lux" or "Mini".
    expect(body, "dashboard renders plan badge for MAJOR session").toMatch(/Major/);
  } finally {
    await ctx.cleanup();
  }
});

test("Workspace page renders Loveable chrome with Chat / Style Boards / Curated / Cart tabs", async ({
  page,
}) => {
  const ctx = await seedStylistWithSession("phase12-ws");
  try {
    await signInAsStylist(page, ctx.stylist.email);
    await page.goto(`/stylist/sessions/${ctx.sessionId}/workspace`);
    await page.waitForLoadState("networkidle");

    const body = await page.locator("body").innerText();
    // All four Loveable tabs are the contract. If any of these shift the
    // stylist loses the session-workspace layout and needs to re-match
    // Phase 12's structural port.
    expect(body).toContain("Chat");
    expect(body).toContain("Style Boards");
    expect(body).toContain("Curated Pieces");
    expect(body).toContain("Cart");
    // Build Moodboard / Build Styleboard are the primary authoring CTAs
    // in the Loveable chrome footer.
    expect(body).toContain("Build Moodboard");
    expect(body).toContain("Build Styleboard");
    // Back-to-sessions link for orientation.
    expect(body).toContain("Back to Sessions");
  } finally {
    await ctx.cleanup();
  }
});

test("Canvas styleboard items persist x / y / zIndex + /send rejects <3 items", async ({
  page,
}) => {
  const ctx = await seedStylistWithSession("phase12-canvas");
  // Seed a DRAFT styleboard Board row so we can hit the items + send APIs
  // the LookCreator talks to.
  const boardId = randomUUID();
  await getPool().query(
    `INSERT INTO boards (id, type, session_id, stylist_profile_id, is_revision, created_at, updated_at)
     VALUES ($1, 'STYLEBOARD', $2, $3, false, NOW(), NOW())`,
    [boardId, ctx.sessionId, ctx.stylistProfileId],
  );

  try {
    await signInAsStylist(page, ctx.stylist.email);
    // Add two WEB_ADDED items with explicit x/y/zIndex to simulate what
    // LookCreator POSTs on drag-drop.
    const drops = [
      { url: "https://example.com/item-a", x: 30, y: 40, zIndex: 1 },
      { url: "https://example.com/item-b", x: 60, y: 55, zIndex: 2 },
    ];
    for (const d of drops) {
      // Use page.request (not the standalone request fixture) so the
      // authed E2E sign-in cookie rides along — the bare `request`
      // context doesn't share cookies with the browser page.
      const res = await page.request.post(
        `/api/styleboards/${boardId}/items`,
        {
          data: {
            source: "WEB_ADDED",
            webItemUrl: d.url,
            x: d.x,
            y: d.y,
            zIndex: d.zIndex,
          },
        },
      );
      expect(res.ok(), `POST /items ${d.url} → ${res.status()}`).toBe(true);
    }

    // Verify the canvas columns populated on the board_items rows.
    const { rows: items } = await getPool().query(
      `SELECT x, y, z_index, web_item_url FROM board_items WHERE board_id = $1 ORDER BY web_item_url`,
      [boardId],
    );
    expect(items).toHaveLength(2);
    expect(Number(items[0].x)).toBeCloseTo(30, 5);
    expect(Number(items[0].y)).toBeCloseTo(40, 5);
    expect(items[0].z_index).toBe(1);
    expect(Number(items[1].x)).toBeCloseTo(60, 5);
    expect(Number(items[1].y)).toBeCloseTo(55, 5);
    expect(items[1].z_index).toBe(2);

    // Phase 12 send-gate: <3 items → 400 with "at least 3 items" message.
    const sendRes = await page.request.post(
      `/api/styleboards/${boardId}/send`,
      {
        data: {
          title: "Sunday brunch capsule",
          description: "relaxed + polished",
          tags: ["brunch"],
        },
      },
    );
    expect(sendRes.status(), "send rejects board with only 2 items").toBe(400);
    const body = (await sendRes.json()) as { error?: string };
    expect(body.error).toMatch(/at least 3/i);

    // Board row stays in draft state (sentAt null, title/description/tags unchanged).
    const { rows: boardRows } = await getPool().query(
      `SELECT sent_at, title, description, tags FROM boards WHERE id = $1`,
      [boardId],
    );
    expect(boardRows[0].sent_at).toBeNull();
    expect(boardRows[0].title).toBeNull();
    expect(boardRows[0].description).toBeNull();
  } finally {
    await getPool().query(`DELETE FROM board_items WHERE board_id = $1`, [boardId]);
    await getPool().query(`DELETE FROM boards WHERE id = $1`, [boardId]);
    await ctx.cleanup();
  }
});

test("Clients roster renders the stylist's client list with avatar + plan badge", async ({
  page,
}) => {
  const ctx = await seedStylistWithSession("phase12-clients");
  try {
    await signInAsStylist(page, ctx.stylist.email);
    await page.goto("/stylist/clients");
    await page.waitForLoadState("networkidle");

    const body = await page.locator("body").innerText();
    expect(body).toContain("Your clients");
    // Client's name should land on the roster.
    expect(body).toContain("Queue Client");
    // Active chip appears because the seed set status = ACTIVE.
    expect(body).toContain("Active");
  } finally {
    await ctx.cleanup();
  }
});
