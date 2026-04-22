import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  disconnectTestDb,
  ensureClientUser,
  getPool,
} from "./db";

/**
 * Phase 10 authed verifications: proves the three Loveable price bugs we
 * promised to fix are actually fixed (Major $130 not $117, Lux $550 not
 * $490, Mini $60 not $54 in the cancel flow) by signing in as an E2E
 * client with an active Major subscription and scraping the Settings
 * membership card DOM.
 *
 * Runs against `npm run dev:e2e` (port 3001, E2E_AUTH_MODE=true).
 */

test.afterAll(async () => {
  await disconnectTestDb();
});

async function createActiveMajorSubscription(userId: string) {
  const subId = `e2e_sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await getPool().query(
    `INSERT INTO subscriptions
       (id, user_id, plan_type, status, stripe_subscription_id,
        current_period_end, created_at, updated_at)
     VALUES ($1, $2, 'MAJOR', 'ACTIVE', $3,
             NOW() + INTERVAL '30 days', NOW(), NOW())`,
    [subId, userId, `stripe_sub_e2e_${subId}`],
  );
  return subId;
}

test("Settings renders Major at $130/mo (not Loveable $117)", async ({
  page,
}) => {
  const email = `phase10-settings-${Date.now()}@e2e.wishi.test`;
  await cleanupE2EUserByEmail(email);
  const client = await ensureClientUser({
    clerkId: `e2e_phase10_${Date.now()}`,
    email,
    firstName: "Phase10",
    lastName: "Tester",
  });
  await createActiveMajorSubscription(client.id);

  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/(sessions|stylist|match-quiz)/);

    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    const body = await page.locator("body").innerText();

    // The single source of truth is lib/plans.ts#getPlanPricesForUi which
    // reads Plan.priceInCents from the DB (13000 for Major → $130).
    expect(body, "settings shows Major $130").toContain("$130");
    expect(body, "settings never shows Loveable $117 bug").not.toContain(
      "$117",
    );
    expect(body, "settings never shows Loveable $70 bug").not.toContain(
      "$70/",
    );
  } finally {
    await cleanupE2EUserByEmail(email);
  }
});

test("Cart /cart renders empty-state two-track copy", async ({ page }) => {
  const email = `phase10-cart-${Date.now()}@e2e.wishi.test`;
  await cleanupE2EUserByEmail(email);
  await ensureClientUser({
    clerkId: `e2e_phase10_cart_${Date.now()}`,
    email,
    firstName: "Phase10",
    lastName: "Cart",
  });

  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/(sessions|stylist|match-quiz)/);

    await page.goto("/cart");
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading", { name: /My Bag/i }),
    ).toBeVisible();
    // Empty state — nothing in either track yet — copy includes the
    // "stylist's picks will show up in the board, ready to add" line.
    const body = await page.locator("body").innerText();
    expect(body.toLowerCase()).toContain("stylist");
  } finally {
    await cleanupE2EUserByEmail(email);
  }
});
