import { expect, test, type Page } from "@playwright/test";
import { ensureClientUser, cleanupE2EUserByEmail } from "./db";

/**
 * /settings redesign from the post-Phase-10 design refresh.
 * - Hero band with "Settings" headline replaces the prior linear column
 * - Cards laid out in a 3-column grid with icon badges
 * - Mixed card kinds: expand (Personal info / Membership / Loyalty),
 *   external Stripe portal (Payment method), and links (Orders / Closet /
 *   Favorites)
 * - Personal info / Membership / Loyalty content unchanged — same forms
 *   and components, just relocated into expandable cards
 */

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/(sessions|stylist|match-quiz|sessions)/);
}

test("/settings renders hero + all 7 settings cards", async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const email = `settings-grid-${stamp}@e2e.wishi.test`;
  const clerkId = `e2e_settings_grid_${stamp}`;
  await ensureClientUser({ clerkId, email, firstName: "Grid", lastName: "Tester" });
  try {
    await signIn(page, email);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", { name: "Settings", level: 1 }),
    ).toBeVisible();

    const body = await page.locator("body").innerText();
    for (const cardTitle of [
      "Personal info",
      "Membership",
      "Loyalty rewards",
      "Payment method",
      "Orders",
      "Closet",
      "Favorites",
    ]) {
      expect(body).toContain(cardTitle);
    }
  } finally {
    await cleanupE2EUserByEmail(email);
  }
});

test("/settings clicking the Personal info card expands the ProfileForm inline", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const email = `settings-expand-${stamp}@e2e.wishi.test`;
  const clerkId = `e2e_settings_expand_${stamp}`;
  await ensureClientUser({ clerkId, email, firstName: "Expand", lastName: "Tester" });
  try {
    await signIn(page, email);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const personalInfoBtn = page
      .getByRole("button", { name: /Personal info/i })
      .first();
    await expect(personalInfoBtn).toHaveAttribute("aria-expanded", "false");

    await personalInfoBtn.click();
    await expect(personalInfoBtn).toHaveAttribute("aria-expanded", "true");

    await expect(page.getByLabel("First name")).toBeVisible();
    await expect(page.getByLabel("Last name")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Save changes/i }),
    ).toBeVisible();
  } finally {
    await cleanupE2EUserByEmail(email);
  }
});

test("/settings static link cards point to the right routes", async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const email = `settings-links-${stamp}@e2e.wishi.test`;
  const clerkId = `e2e_settings_links_${stamp}`;
  await ensureClientUser({ clerkId, email, firstName: "Links", lastName: "Tester" });
  try {
    await signIn(page, email);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("link", { name: /Orders.+Review every order/i }),
    ).toHaveAttribute("href", "/orders");
    await expect(
      page.getByRole("link", { name: /Closet.+pieces you already own/i }),
    ).toHaveAttribute("href", "/closet");
    await expect(
      page.getByRole("link", { name: /Favorites.+stylists you/i }),
    ).toHaveAttribute("href", "/favorites");
  } finally {
    await cleanupE2EUserByEmail(email);
  }
});
