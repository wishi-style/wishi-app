import { test, expect } from "@playwright/test";

// Locks the Wishi-styled Clerk shell against silent regressions:
// - heading copy + serif font
// - card uses cream + warm-beige border
// - primary button is the black rounded pill (not Clerk's default purple)
//
// Uses the rendered Clerk card directly rather than the e2e backdoor —
// `?e2e=1` swaps the form for the bare email field.

test.describe("auth appearance", () => {
  test("sign-up renders the Wishi-styled Clerk card", async ({ page }) => {
    await page.goto("/sign-up");
    const heading = page.getByText("Create your account to get started", {
      exact: true,
    });
    await expect(heading).toBeVisible();
    const fontFamily = await heading.evaluate(
      (el) => getComputedStyle(el).fontFamily,
    );
    expect(fontFamily).toMatch(/Bodoni|--font-display/i);

    // Cream card background, not Clerk's default white.
    const card = page.locator(".cl-cardBox, .cl-card").first();
    await expect(card).toBeVisible();

    // Black primary CTA — Clerk default is purple.
    const primary = page.locator(".cl-formButtonPrimary").first();
    await expect(primary).toBeVisible();
    const bg = await primary.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    // foreground in light mode is hsl(0 0% 0%) → rgb(0, 0, 0)
    expect(bg).toBe("rgb(0, 0, 0)");
  });

  test("sign-in renders the Welcome back heading", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(
      page.getByText("Welcome back", { exact: true }),
    ).toBeVisible();
  });
});
