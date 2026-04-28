import { expect, test } from "@playwright/test";

/**
 * /how-it-works 2-column refresh from the post-Phase-10 design refresh.
 * Loveable restructured the hero from a single-column 5-step grid to a
 * two-column layout with steps text on the left and an embedded brand
 * video on the right. CTA is now auth-aware.
 *
 * Runs against `npm run dev:e2e` (port 3001, E2E_AUTH_MODE=true).
 */

test("/how-it-works renders the 2-column hero + embedded brand video", async ({
  page,
}) => {
  await page.goto("/how-it-works");
  await page.waitForLoadState("networkidle");

  // Hero
  await expect(
    page.getByRole("heading", { name: /^How it Works$/i }),
  ).toBeVisible();

  // Embedded YouTube iframe with the brand video ID
  const iframe = page.locator('iframe[title="How Wishi Works"]');
  await expect(iframe).toHaveAttribute("src", /youtube\.com\/embed\/92ErFLJyJCk/);

  // 5 step copy is preserved
  const body = await page.locator("body").innerText();
  expect(body).toContain("Tell us About You");
  expect(body).toContain("Meet Your Stylist");
  expect(body).toContain("Get Your Style Boards");
  expect(body).toContain("Collaborate & Refine");
  expect(body).toContain("Shop What You Love");

  // Down-page sections preserved
  expect(body).toContain("Use What You Already Own");
  expect(body).toContain("Why Wishi Works");
  expect(body).toContain("Get Styled For");

  // Locked-out copy never reappears (defends against Loveable's reintroduction
  // of "Capsule Wardrobe" / "Wishi capsule" / "2 capsules" in their LuxPackage
  // refresh — same risk class).
  expect(body.toLowerCase()).not.toContain("capsule");
  expect(body.toLowerCase()).not.toContain("free shipping");
  expect(body.toLowerCase()).not.toContain("virtual fitting");
});

test("/how-it-works anonymous CTA targets /match-quiz", async ({ page }) => {
  await page.goto("/how-it-works");
  await page.waitForLoadState("networkidle");

  // Anon visitors flow through /match-quiz before /match-quiz + sign-up.
  const cta = page.getByRole("link", { name: /Find Your Best Match/i });
  await expect(cta).toHaveAttribute("href", "/match-quiz");
});
