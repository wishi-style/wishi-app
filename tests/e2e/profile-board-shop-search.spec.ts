import { expect, test, type Page } from "@playwright/test";
import {
  ensureStylistUser,
  ensureStylistProfile,
  cleanupStylistProfile,
  cleanupE2EUserByEmail,
  getPool,
} from "./db";

/**
 * Pins the fix for the profile-board Shop tab: typing a query has to fire a
 * POST to `/api/stylist/profile/shop-inventory` and replace the rendered
 * items. Pre-fix, the hook short-circuited on `sessionId === null` and the
 * SSR-hydrated initial page stayed put no matter what the stylist typed.
 */

async function signInAsStylist(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in?e2e=1");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

test("profile-board Shop tab fires sessionless search request on query", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const email = `profile-shop-search-${stamp}@e2e.wishi.test`;
  const stylist = await ensureStylistUser({
    clerkId: `e2e_profile_shop_search_${stamp}`,
    email,
    firstName: "Shop",
    lastName: "Search",
  });
  await ensureStylistProfile({
    userId: stylist.id,
    onboardingStatus: "ELIGIBLE",
  });
  await getPool().query(
    `UPDATE stylist_profiles
       SET style_specialties = ARRAY['Classic']
     WHERE user_id = $1`,
    [stylist.id],
  );

  try {
    await signInAsStylist(page, email);

    const allBodies: Record<string, unknown>[] = [];
    let capturedBody: Record<string, unknown> | null = null;
    await page.route(
      "**/api/stylist/profile/shop-inventory",
      async (route) => {
        const raw = route.request().postData();
        let body: Record<string, unknown> | null = null;
        if (raw) {
          try {
            body = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            body = null;
          }
        }
        if (body) {
          allBodies.push(body);
          if (typeof body.query === "string" && body.query.length > 0) {
            capturedBody = body;
          }
        }
        await route.continue();
      },
    );

    await page.goto(
      "/stylist/profile/boards/new/styleboard?style=Classic",
    );

    const searchInput = page.getByPlaceholder(/Search the catalog/i);
    await expect(searchInput).toBeVisible({ timeout: 10_000 });

    await searchInput.fill("baggy jeans");

    // The hook debounces query input by 250ms; give it room to fire.
    await page.waitForTimeout(1000);

    expect(
      capturedBody,
      `Expected a POST body carrying query="baggy jeans". Bodies seen: ${JSON.stringify(allBodies, null, 2)}`,
    ).toBeTruthy();
    expect((capturedBody as Record<string, unknown>).query).toBe("baggy jeans");

    // Active filter chip surfaces the typed query — pinned because the chrome
    // already worked pre-fix; we want to keep it wired in case the hook
    // short-circuit creeps back in a future refactor.
    await expect(page.getByText(/Search: "baggy jeans"/)).toBeVisible();
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(email);
  }
});
