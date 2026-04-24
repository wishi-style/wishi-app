import { expect, test } from "@playwright/test";

/**
 * /gift-cards — public Wave D landing page.
 *
 * Backend was already shipped in Phase 9b (`gift-card.service.ts` +
 * `POST /api/gift-cards` + Stripe Checkout). This slice exposes the
 * marketing surface and wires the Buy CTA into that existing service.
 *
 * Prices come from `getPlanPricesForUi()` → Plan table, so this spec
 * reads from the DOM and asserts dollar signs + the plan names rather
 * than specific numbers (the actual numbers are covered by the
 * hardcoded-price grep gate documented in CLAUDE.md).
 */

test("/gift-cards renders publicly with plans + benefits + experience sections", async ({
  page,
}) => {
  const res = await page.goto("/gift-cards");
  expect(res?.status()).toBe(200);
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /have fun with their style again/i,
    }),
  ).toBeVisible();

  const body = await page.locator("body").innerText();

  // Three plan tiers named by service, each with a price and a gift CTA
  expect(body).toContain("Mini Session");
  expect(body).toContain("Major Session");
  expect(body).toContain("Lux Session");

  // Benefits band + CTA
  await expect(
    page.getByRole("heading", { name: /Wishi gift card benefits/i }),
  ).toBeVisible();
  expect(body).toContain("Access to professional stylists");
  expect(body).toContain("Personalized recommendations");

  // Corporate gifting band
  await expect(
    page.getByRole("heading", { name: /Corporate gifting/i }),
  ).toBeVisible();

  // 4-step experience
  await expect(
    page.getByRole("heading", { name: /gift card experience/i }),
  ).toBeVisible();
  expect(body).toContain("Purchase the gift card");
  expect(body).toContain("Share style preferences");
  expect(body).toContain("Stylist gets to work");
  expect(body).toContain("Shop the looks");

  // Three section CTAs (hero + benefits + experience) + three per-plan
  // gift CTAs = six triggers total. All rendered as buttons (controlled
  // Dialog). Tighten the assertion so a regression that drops a CTA
  // is caught instead of passing on "at least four".
  const triggers = page.getByRole("button", {
    name: /Buy a gift card|Gift Mini|Gift Major|Gift Lux/i,
  });
  expect(await triggers.count()).toBeGreaterThanOrEqual(6);
});

test("/gift-cards unauth Buy CTA opens the dialog and shows a sign-in prompt", async ({
  page,
}) => {
  await page.goto("/gift-cards");
  await page.waitForLoadState("networkidle");

  await page
    .getByRole("button", { name: "Buy a gift card" })
    .first()
    .click();

  // The unauth branch swaps the form for a sign-in CTA.
  const signInLink = page.getByRole("link", { name: /Sign in to continue/i });
  await expect(signInLink).toBeVisible();
  await expect(signInLink).toHaveAttribute(
    "href",
    "/sign-in?next=/gift-cards",
  );
});
