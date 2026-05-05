import { expect, test } from "@playwright/test";
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
 * Regression: tapping the heart on stylist A used to leave stylist B's heart
 * unresponsive — the click fired the API call but the optimistic UI state
 * sat in React's transition queue behind the previous toggle's in-flight
 * fetch (because `startTransition(async () => fetch())` was being called
 * from inside the `setFavorites` updater). This spec asserts both hearts
 * fill in succession without a refresh.
 */

test.afterAll(async () => {
  await disconnectTestDb();
});

test("clicking heart on multiple stylists in succession favorites all of them", async ({
  page,
}) => {
  const ts = Date.now();
  const clientEmail = `fav-toggle-client-${ts}@e2e.wishi.test`;
  const stylistAEmail = `fav-toggle-styl-a-${ts}@e2e.wishi.test`;
  const stylistBEmail = `fav-toggle-styl-b-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_fav_client_${ts}`,
    email: clientEmail,
    firstName: "Fav",
    lastName: "Tester",
  });
  const stylistA = await ensureStylistUser({
    clerkId: `e2e_fav_styla_${ts}`,
    email: stylistAEmail,
    firstName: "Ada",
    lastName: `Toggle${ts}A`,
  });
  const stylistB = await ensureStylistUser({
    clerkId: `e2e_fav_stylb_${ts}`,
    email: stylistBEmail,
    firstName: "Bea",
    lastName: `Toggle${ts}B`,
  });
  const profileA = await ensureStylistProfile({ userId: stylistA.id });
  const profileB = await ensureStylistProfile({ userId: stylistB.id });

  try {
    await page.goto("/sign-in?e2e=1");
    await page.getByLabel("Email").fill(clientEmail);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).not.toHaveURL(/\/sign-in/);

    await page.goto("/stylists");
    const heartA = page.getByRole("button", {
      name: `Favorite Ada Toggle${ts}A`,
    });
    const heartB = page.getByRole("button", {
      name: `Favorite Bea Toggle${ts}B`,
    });
    await expect(heartA).toBeVisible();
    await expect(heartB).toBeVisible();

    const postA = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/favorites/stylists") &&
        r.request().method() === "POST",
    );
    await heartA.click();
    await expect(
      page.getByRole("button", { name: `Unfavorite Ada Toggle${ts}A` }),
    ).toBeVisible();
    await postA;

    // The bug: this second click's optimistic update was held back behind
    // the first click's still-pending async transition, so the heart never
    // flipped to "Unfavorite" until a manual refresh. Assert it flips now.
    const postB = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/favorites/stylists") &&
        r.request().method() === "POST",
    );
    await heartB.click();
    await expect(
      page.getByRole("button", { name: `Unfavorite Bea Toggle${ts}B` }),
    ).toBeVisible();
    await postB;

    // And both server-side rows landed.
    const { rows } = await getPool().query(
      `SELECT stylist_profile_id FROM favorite_stylists WHERE user_id = $1 ORDER BY created_at`,
      [client.id],
    );
    expect(rows.map((r) => r.stylist_profile_id).sort()).toEqual(
      [profileA.id, profileB.id].sort(),
    );
  } finally {
    await cleanupStylistProfile(stylistA.id);
    await cleanupStylistProfile(stylistB.id);
    await cleanupE2EUserByEmail(stylistAEmail);
    await cleanupE2EUserByEmail(stylistBEmail);
    await cleanupE2EUserByEmail(clientEmail);
  }
});
