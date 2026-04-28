import { expect, test } from "@playwright/test";
import {
  ensureStylistUser,
  ensureStylistProfile,
  cleanupStylistProfile,
  cleanupE2EUserByEmail,
} from "./db";

/**
 * /stylists redesign from the post-Phase-10 design refresh.
 * - "What You Receive" trigger band sits above the hero CTA
 * - Clicking the trigger opens a dialog with the 6 service feature cards
 * - StylistCard now uses the overlapping-avatar bottom-CTA layout
 *   (button text matches Loveable's "Meet [Name]" / "Join waitlist")
 *
 * Click-through assertion below was added after a production regression
 * where clicking "Meet [Name]" bounced the user to the root error
 * boundary — the original test only checked that the dialog rendered.
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

test("/stylists → click 'Meet [Name]' on a card → /stylists/[id] hero loads (no error boundary)", async ({
  page,
}) => {
  // Regression cover for the production bug: an authed user clicked Meet,
  // the profile server-component crashed mid-render, and the root error
  // boundary replaced the entire app with "Try again". The original
  // /stylists tests didn't click the card. This one does.
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const stylistEmail = `stylists-meet-${stamp}@e2e.wishi.test`;
  const firstName = `Iris${stamp.slice(-4)}`;

  const stylist = await ensureStylistUser({
    clerkId: `e2e_stylists_meet_${stamp}`,
    email: stylistEmail,
    firstName,
    lastName: "Card",
  });
  const profile = await ensureStylistProfile({ userId: stylist.id });

  try {
    await page.goto("/stylists");
    await page.waitForLoadState("networkidle");

    const card = page
      .getByRole("link", { name: new RegExp(`Meet ${firstName}`, "i") })
      .first();
    await expect(card).toBeVisible();
    await card.click();

    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(new RegExp(`/stylists/${profile.id}`));

    // Profile must render — not the global error boundary.
    await expect(
      page.getByRole("heading", { level: 1, name: new RegExp(firstName) }),
    ).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/Something went wrong/i);
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
