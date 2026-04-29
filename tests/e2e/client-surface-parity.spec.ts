import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  disconnectTestDb,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
} from "./db";

/**
 * P2 batch 2 verifications: §3.5 (/orders tabs) + §3.8 (/feed favorite heart).
 *
 * Runs against `npm run dev:e2e` (port 3001, E2E_AUTH_MODE=true).
 */

test.afterAll(async () => {
  await disconnectTestDb();
});

async function signInAsClient(
  page: import("@playwright/test").Page,
  email: string,
) {
  await page.goto("/sign-in?e2e=1");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

test("§3.5 — /orders renders Tabs (All / Active / Past) once an order exists", async ({
  page,
}) => {
  const ts = Date.now();
  const email = `p2-orders-${ts}@e2e.wishi.test`;
  const clerkId = `e2e_p2_orders_${ts}`;
  const client = await ensureClientUser({
    clerkId,
    email,
    firstName: "Orders",
    lastName: "Tabs",
  });
  const orderId = `e2e_order_${ts}`;
  await getPool().query(
    `INSERT INTO orders
       (id, user_id, source, status, retailer, total_in_cents, tax_in_cents, shipping_in_cents, created_at, updated_at)
     VALUES ($1, $2, 'DIRECT_SALE', 'ORDERED', 'Test Boutique', 12000, 1000, 1000, NOW(), NOW())`,
    [orderId, client.id],
  );
  try {
    await signInAsClient(page, email);
    await page.goto("/orders");
    await page.waitForLoadState("networkidle");

    // Tabs render the three Loveable buckets with counts.
    await expect(page.getByRole("tab", { name: /^All \(\d+\)/ })).toBeVisible();
    await expect(
      page.getByRole("tab", { name: /^Active \(\d+\)/ }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: /^Past \(\d+\)/ })).toBeVisible();

    // The seeded ORDERED row buckets into Active.
    await page.getByRole("tab", { name: /^Active/ }).click();
    await expect(page.getByText("Test Boutique")).toBeVisible();
  } finally {
    await getPool().query("DELETE FROM orders WHERE id = $1", [orderId]);
    await cleanupE2EUserByEmail(email);
  }
});

async function seedFeedBoard(prefix: string): Promise<{
  stylistEmail: string;
  stylistUserId: string;
  boardId: string;
}> {
  const ts = Date.now() + Math.floor(Math.random() * 1_000);
  const stylistEmail = `${prefix}-stylist-${ts}@e2e.wishi.test`;
  const stylistClerkId = `e2e_${prefix}_stylist_${ts}`;
  const stylist = await ensureStylistUser({
    clerkId: stylistClerkId,
    email: stylistEmail,
    firstName: "Heart",
    lastName: "Stylist",
  });
  const profile = await ensureStylistProfile({ userId: stylist.id });
  const boardId = `bd_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  await getPool().query(
    `INSERT INTO boards (id, type, stylist_profile_id, is_featured_on_profile, profile_style, title, created_at, updated_at)
     VALUES ($1, 'STYLEBOARD', $2, true, 'minimalist', 'Spec Cover Look', NOW(), NOW())`,
    [boardId, profile.id],
  );
  await getPool().query(
    `INSERT INTO board_photos (id, board_id, s3_key, url, order_index, created_at, updated_at)
     VALUES ($1, $2, 'spec/key.jpg', 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d', 0, NOW(), NOW())`,
    [`bp_${ts}`, boardId],
  );
  return { stylistEmail, stylistUserId: stylist.id, boardId };
}

test("§3.8 — /feed Save-look heart toggle persists for an authed client", async ({
  page,
}) => {
  const ts = Date.now();
  const clientEmail = `p2-feed-${ts}@e2e.wishi.test`;
  const clientClerkId = `e2e_p2_feed_${ts}`;
  const client = await ensureClientUser({
    clerkId: clientClerkId,
    email: clientEmail,
    firstName: "Heart",
    lastName: "Tapper",
  });
  const fixture = await seedFeedBoard("p2-feed");
  try {
    await signInAsClient(page, clientEmail);
    await page.goto("/feed?gender=WOMEN");
    await page.waitForLoadState("networkidle");

    const saveButton = page
      .getByRole("button", { name: "Save look", exact: true })
      .first();
    await expect(saveButton).toBeVisible();
    expect(await saveButton.getAttribute("aria-pressed")).toBe("false");

    await saveButton.click();
    await expect(
      page
        .getByRole("button", { name: "Remove from favorites", exact: true })
        .first(),
    ).toBeVisible();

    // Reload — favorited state must round-trip through the API + DB.
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(
      page
        .getByRole("button", { name: "Remove from favorites", exact: true })
        .first(),
    ).toBeVisible();
  } finally {
    await getPool().query("DELETE FROM favorite_boards WHERE user_id = $1", [
      client.id,
    ]);
    await getPool().query("DELETE FROM board_photos WHERE board_id = $1", [
      fixture.boardId,
    ]);
    await getPool().query("DELETE FROM boards WHERE id = $1", [fixture.boardId]);
    await cleanupStylistProfile(fixture.stylistUserId);
    await cleanupE2EUserByEmail(fixture.stylistEmail);
    await cleanupE2EUserByEmail(clientEmail);
  }
});
