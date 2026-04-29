import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  createBoardFixture,
  createSessionForClient,
  disconnectTestDb,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
  seedSessionMessages,
} from "../e2e/db";

// Stylist visual regression — covers the post-PR-80 cascade per
// `wishi-style/STYLIST-PARITY-AUDIT.md`. Specs run sequentially because they
// share a seeded DB. Baselines live under stylist.spec.ts-snapshots/ with the
// per-OS suffix (`-darwin`, `-linux`); regenerate with
// `npm run test:visual:stylist:update`.

test.afterAll(async () => {
  await disconnectTestDb();
});

interface Ctx {
  stylistEmail: string;
  sessionId: string;
  cleanup: () => Promise<void>;
}

async function seed(prefix: string): Promise<Ctx> {
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const clientEmail = `${prefix}-client-${ts}@e2e.wishi.test`;
  const stylistEmail = `${prefix}-stylist-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_${prefix}_c_${ts}`,
    email: clientEmail,
    firstName: "Visual",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_${prefix}_s_${ts}`,
    email: stylistEmail,
    firstName: "Visual",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });
  await getPool().query(
    `UPDATE sessions SET twilio_channel_sid = $1 WHERE id = $2`,
    [`CH_e2e_visual_${ts}`, session.id],
  );
  return {
    stylistEmail,
    sessionId: session.id,
    async cleanup() {
      await cleanupStylistProfile(stylist.id);
      await cleanupE2EUserByEmail(clientEmail);
      await cleanupE2EUserByEmail(stylistEmail);
    },
  };
}

/**
 * Extended seed for the workspace chat-body baseline. Adds a MoodBoard board,
 * a StyleBoard board, and 5 representative messages (TEXT × 2 + MOODBOARD +
 * STYLEBOARD + SINGLE_ITEM) so every chat renderer is exercised.
 */
async function seedWorkspaceChat(ctx: Ctx & { stylistUserId: string; clientUserId: string }) {
  const moodboard = await createBoardFixture({
    sessionId: ctx.sessionId,
    type: "MOODBOARD",
    title: "Inspiration board",
    sentMinutesAgo: 8,
  });
  const styleboard = await createBoardFixture({
    sessionId: ctx.sessionId,
    type: "STYLEBOARD",
    title: "Polished-yet-relaxed",
    sentMinutesAgo: 6,
  });
  await seedSessionMessages(ctx.sessionId, [
    {
      kind: "TEXT",
      authorUserId: ctx.stylistUserId,
      text: "Hi! Just checking in on your styling session.",
    },
    {
      kind: "TEXT",
      authorUserId: ctx.clientUserId,
      text: "Thanks! I'm excited to see what you put together.",
    },
    {
      kind: "MOODBOARD",
      authorUserId: ctx.stylistUserId,
      text: null,
      boardId: moodboard.id,
    },
    {
      kind: "STYLEBOARD",
      authorUserId: ctx.stylistUserId,
      text: null,
      boardId: styleboard.id,
    },
    {
      kind: "SINGLE_ITEM",
      authorUserId: ctx.stylistUserId,
      text: "Recommended: Acne Studios Loop Cardigan — $720",
      singleItemWebUrl: "https://example.com/cardigan",
    },
  ]);
}

async function seedWithUsers(prefix: string): Promise<
  Ctx & { stylistUserId: string; clientUserId: string }
> {
  const base = await seed(prefix);
  // Re-fetch user ids by email so the chat seed can author rows correctly.
  const p = getPool();
  const { rows } = await p.query(
    `SELECT email, id FROM users WHERE email IN ($1, $2)`,
    [
      base.stylistEmail,
      base.stylistEmail.replace("-stylist-", "-client-"),
    ],
  );
  const stylist = rows.find((r) => r.email === base.stylistEmail);
  const client = rows.find((r) => r.email !== base.stylistEmail);
  return {
    ...base,
    stylistUserId: stylist!.id,
    clientUserId: client!.id,
  };
}

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-in?e2e=1");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/(stylist|sessions|onboarding)/, {
    timeout: 30_000,
  });
}

test("stylist dashboard visual", async ({ page }) => {
  const ctx = await seed("dash");
  try {
    await signIn(page, ctx.stylistEmail);
    await page.goto("/stylist/dashboard");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("stylist-dashboard.png", {
      fullPage: true,
    });
  } finally {
    await ctx.cleanup();
  }
});

test("stylist sessions list visual", async ({ page }) => {
  const ctx = await seed("ses");
  try {
    await signIn(page, ctx.stylistEmail);
    await page.goto("/stylist/sessions");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("stylist-sessions.png", {
      fullPage: true,
    });
  } finally {
    await ctx.cleanup();
  }
});

test("stylist clients roster visual", async ({ page }) => {
  const ctx = await seed("cli");
  try {
    await signIn(page, ctx.stylistEmail);
    await page.goto("/stylist/clients");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("stylist-clients.png", {
      fullPage: true,
    });
  } finally {
    await ctx.cleanup();
  }
});

test("stylist workspace chat (seeded) visual", async ({ page }) => {
  const ctx = await seedWithUsers("ws");
  await seedWorkspaceChat(ctx);
  try {
    await signIn(page, ctx.stylistEmail);
    await page.goto(`/stylist/sessions/${ctx.sessionId}/workspace`);
    await page.waitForLoadState("networkidle");
    // Allow the DB-bootstrap path in use-chat.ts to populate messages and
    // the message-list to settle. Twilio will fail with "Not Found" for the
    // fake CH_e2e_visual_* channel; the new bootstrap-from-DB path keeps
    // the chat body rendered regardless.
    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot("stylist-workspace-chat.png", {
      fullPage: true,
    });
  } finally {
    await ctx.cleanup();
  }
});

test("stylist workspace styleboards tab visual", async ({ page }) => {
  const ctx = await seedWithUsers("wsst");
  await seedWorkspaceChat(ctx);
  try {
    await signIn(page, ctx.stylistEmail);
    await page.goto(`/stylist/sessions/${ctx.sessionId}/workspace`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /^Style Boards$/ }).click();
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot("stylist-workspace-styleboards.png", {
      fullPage: true,
    });
  } finally {
    await ctx.cleanup();
  }
});

test("stylist workspace curated tab visual", async ({ page }) => {
  const ctx = await seedWithUsers("wscu");
  await seedWorkspaceChat(ctx);
  try {
    await signIn(page, ctx.stylistEmail);
    await page.goto(`/stylist/sessions/${ctx.sessionId}/workspace`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /^Curated Pieces$/ }).click();
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot("stylist-workspace-curated.png", {
      fullPage: true,
    });
  } finally {
    await ctx.cleanup();
  }
});

test("stylist workspace cart tab visual", async ({ page }) => {
  const ctx = await seedWithUsers("wsca");
  await seedWorkspaceChat(ctx);
  try {
    await signIn(page, ctx.stylistEmail);
    await page.goto(`/stylist/sessions/${ctx.sessionId}/workspace`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /^Cart/ }).click();
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot("stylist-workspace-cart.png", {
      fullPage: true,
    });
  } finally {
    await ctx.cleanup();
  }
});

test("stylist moodboard creator visual", async ({ page }) => {
  const ctx = await seed("mb");
  try {
    await signIn(page, ctx.stylistEmail);
    await page.goto(`/stylist/sessions/${ctx.sessionId}/moodboards/new`);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("stylist-moodboard-creator.png", {
      fullPage: true,
    });
  } finally {
    await ctx.cleanup();
  }
});

test("stylist look creator visual", async ({ page }) => {
  const ctx = await seed("lk");
  try {
    // Stub the inventory auto-search so the Shop tab grid is deterministic —
    // tastegraph image URLs vary by run/cache and lazy-load on intersection,
    // which blew the 0.5% diff budget. The fixture proves the auto-search
    // wiring renders into the grid layout without depending on live CDN
    // imagery; product cards fall back to their SVG placeholder when
    // primary_image_url is null.
    await page.route("**/api/products", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          total: 6,
          page: 1,
          pageSize: 24,
          pages: 1,
          results: Array.from({ length: 6 }, (_, i) => ({
            id: `vis-${i}`,
            canonical_name: `Sample item ${i + 1}`,
            canonical_description: null,
            brand_id: "vis-brand",
            brand_name: "Brand",
            category_id: "vis-cat",
            category_slug: "tops",
            gender: "female",
            gtin: "",
            min_price: 100 + i * 10,
            max_price: 100 + i * 10,
            currency: "USD",
            in_stock: true,
            listing_count: 1,
            primary_image_url: null,
            image_urls: [],
            available_sizes: [],
            available_colors: [],
            color_families: [],
            primary_fabric: null,
            fabric_tier: null,
            contains_leather: null,
            updated_at: "2026-04-29T00:00:00Z",
            listings: [],
          })),
        }),
      });
    });
    await signIn(page, ctx.stylistEmail);
    await page.goto(`/stylist/sessions/${ctx.sessionId}/styleboards/new`);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("stylist-look-creator.png", {
      fullPage: true,
    });
  } finally {
    await ctx.cleanup();
  }
});

test("stylist profile boards visual", async ({ page }) => {
  const ctx = await seed("pf");
  try {
    await signIn(page, ctx.stylistEmail);
    await page.goto("/stylist/profile/boards");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("stylist-profile-boards.png", {
      fullPage: true,
    });
  } finally {
    await ctx.cleanup();
  }
});

test("stylist payouts visual", async ({ page }) => {
  const ctx = await seed("po");
  try {
    await signIn(page, ctx.stylistEmail);
    await page.goto("/stylist/payouts");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("stylist-payouts.png", {
      fullPage: true,
    });
  } finally {
    await ctx.cleanup();
  }
});

