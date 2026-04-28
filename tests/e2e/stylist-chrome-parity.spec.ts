import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  disconnectTestDb,
  ensureStylistProfile,
  ensureStylistUser,
} from "./db";

/**
 * P2 batch 1 verifications: D8 (shared StylistTopBar across /stylist/*) +
 * D10 (/stylist/sessions collapses to dashboard).
 *
 * Runs against `npm run dev:e2e` (port 3001, E2E_AUTH_MODE=true).
 */

test.afterAll(async () => {
  await disconnectTestDb();
});

async function seedStylist(prefix: string) {
  const ts = Date.now() + Math.floor(Math.random() * 1_000);
  const stylistEmail = `${prefix}-stylist-${ts}@e2e.wishi.test`;
  const stylistClerkId = `e2e_${prefix}_stylist_${ts}`;
  const stylist = await ensureStylistUser({
    clerkId: stylistClerkId,
    email: stylistEmail,
    firstName: "Chrome",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });
  return {
    email: stylistEmail,
    cleanup: async () => {
      await cleanupStylistProfile(stylist.id);
      await cleanupE2EUserByEmail(stylistEmail);
    },
  };
}

async function signInAsStylist(
  page: import("@playwright/test").Page,
  email: string,
) {
  await page.goto("/sign-in?e2e=1");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/(stylist|sessions|onboarding)/);
}

test("D10 — /stylist/sessions redirects to /stylist/dashboard", async ({
  page,
}) => {
  const ctx = await seedStylist("p2-d10");
  try {
    await signInAsStylist(page, ctx.email);
    await page.goto("/stylist/sessions");
    await expect(page).toHaveURL(/\/stylist\/dashboard$/);
  } finally {
    await ctx.cleanup();
  }
});

test("D8 — shared chrome (Notifications + Settings + Calendar) renders on /stylist/clients", async ({
  page,
}) => {
  const ctx = await seedStylist("p2-d8");
  try {
    await signInAsStylist(page, ctx.email);
    await page.goto("/stylist/clients");
    await page.waitForLoadState("networkidle");

    // The new StylistTopBar exposes Calendar / Notifications / Settings as
    // accessible icon buttons. Their presence on a non-dashboard page is the
    // point of D8 — chrome was previously dashboard-only.
    await expect(
      page.getByRole("button", { name: "Calendar" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Notifications" }),
    ).toBeVisible();
    // Multiple "Settings" controls exist (icon button + dropdown item) — first
    // is the topbar icon.
    await expect(
      page.getByRole("button", { name: "Settings" }).first(),
    ).toBeVisible();
    // The avatar dropdown trigger.
    await expect(
      page.getByRole("button", { name: "Open profile menu" }),
    ).toBeVisible();
  } finally {
    await ctx.cleanup();
  }
});

test("D8 — dashboard renders chrome only once (no duplicate top bar)", async ({
  page,
}) => {
  const ctx = await seedStylist("p2-d8b");
  try {
    await signInAsStylist(page, ctx.email);
    await page.goto("/stylist/dashboard");
    await page.waitForLoadState("networkidle");

    // The Notifications icon button is unique to StylistTopBar — exactly one
    // should render. A duplicate (the old inline header) would mean two.
    await expect(
      page.getByRole("button", { name: "Notifications" }),
    ).toHaveCount(1);
  } finally {
    await ctx.cleanup();
  }
});
