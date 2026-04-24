import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  createSessionForClient,
  disconnectTestDb,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
} from "../e2e/db";

// Phase 12 visual regression for stylist surfaces. Requires E2E_AUTH_MODE
// (configured by playwright.visual-stylist.config.ts) so the sign-in form
// backdoor is active.

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

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/(stylist|sessions|onboarding)/);
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

test("stylist workspace visual", async ({ page }) => {
  const ctx = await seed("ws");
  try {
    await signIn(page, ctx.stylistEmail);
    await page.goto(`/stylist/sessions/${ctx.sessionId}/workspace`);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("stylist-workspace.png", {
      fullPage: true,
    });
  } finally {
    await ctx.cleanup();
  }
});
