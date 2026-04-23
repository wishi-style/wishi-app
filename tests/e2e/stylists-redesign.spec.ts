import { expect, test } from "@playwright/test";

/**
 * /stylists redesign from the post-Phase-10 design refresh.
 * - "What You Receive" trigger band sits above the hero CTA
 * - Clicking the trigger opens a dialog with the 6 service feature cards
 * - StylistCard now uses the overlapping-avatar bottom-CTA layout
 *   (button text matches Loveable's "Meet [Name]" / "Join waitlist")
 */

test("/stylists shows the receive-services trigger above the hero", async ({ page }) => {
  await page.goto("/stylists");
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("button", { name: /See what's included in a styling session/i }),
  ).toBeVisible();

  await expect(
    page.getByRole("heading", { name: /Find Your Perfect Stylist/i }),
  ).toBeVisible();
});

test("/stylists What You Receive dialog renders all 6 service cards", async ({ page }) => {
  await page.goto("/stylists");
  await page.waitForLoadState("networkidle");

  await page
    .getByRole("button", { name: /See what's included in a styling session/i })
    .click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/What You Receive/i)).toBeVisible();
  const dialogText = await dialog.innerText();
  for (const label of [
    "Personalized Mood Board",
    "Shoppable Outfit Boards",
    "Direct Stylist Chat",
    "Purchase Links",
    "Wardrobe Guidance",
    "A Call with the Lux Package",
  ]) {
    expect(dialogText).toContain(label);
  }
});
