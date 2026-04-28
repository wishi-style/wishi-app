import { expect, test } from "@playwright/test";

/**
 * Homepage redesign port from Loveable's post-Phase-10 design refresh.
 * - Hero collage replaces 4-image grid; CTA routes to /match-quiz (funnel-redesign)
 * - Press logo strip uses image assets on a dark background
 * - Featured stylist (Karla) bento grid + 6-stylist tile grid
 * - Pricing teaser with accent bars + per-tier short feature list
 * - Concierge banner with Calendly + #StyledByWishi "View more looks" CTA
 * - Reviews now have stylist attribution + photos
 *
 * Defensive: Loveable's homepage Megan testimonial uses a phrase that's on
 * the founder's blocked-copy list (decision 2026-04-07). This spec gates
 * the rendered DOM so a future re-port can't reintroduce it.
 */

test("/ renders hero, press strip, stylist grid, pricing, reviews, FAQ", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("heading", { name: /#1 App for Personalized Luxury Styling/i }),
  ).toBeVisible();

  const body = await page.locator("body").innerText();

  // Hero + nav bits
  expect(body).toContain("Let's Get Styling");
  expect(body).toContain("How It Works");

  // Press strip headline
  expect(body).toContain("Best Personalized Styling App");

  // Stylist bento grid
  expect(body).toContain("Karla Welch");
  expect(body).toContain("Wishi Co-founder");
  expect(body).toContain("Zuajeiliy");
  expect(body).toContain("Connor");
  expect(body).toContain("Alia");
  expect(body).toContain("Meredith");
  expect(body).toContain("Adriana");
  expect(body).toContain("Daphne");

  // Pricing teaser — prices come from lib/plans, not hardcoded
  expect(body).toContain("Wishi Mini");
  expect(body).toContain("Wishi Major");
  expect(body).toContain("Wishi Lux");
  expect(body).toContain("$60");
  expect(body).toContain("$130");
  expect(body).toContain("$550");

  // #StyledByWishi + new "View more looks" CTA
  expect(body).toContain("#StyledByWishi");
  expect(body).toContain("View more looks");

  // Concierge banner
  expect(body).toContain("Chat with us");
  expect(body).toContain("Schedule consultation");

  // Reviews — now with stylist attribution
  expect(body).toContain("Vicki");
  expect(body).toContain("Styled by Daphne V.");

  // FAQ
  expect(body).toContain("Your Questions, Answered");
  expect(body).toContain("How does this service work?");
});

test("/ rendered DOM stays free of locked-out copy", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Open every FAQ accordion so its body is in the DOM too
  const faqButtons = page.locator("button[aria-expanded]");
  const count = await faqButtons.count();
  for (let i = 0; i < count; i++) {
    await faqButtons.nth(i).click();
  }

  const html = await page.content();
  expect(html.toLowerCase()).not.toContain("capsule");
  expect(html.toLowerCase()).not.toContain("free shipping");
  expect(html.toLowerCase()).not.toContain("free & priority");
  expect(html.toLowerCase()).not.toContain("virtual fitting");
});

test("/ hero + final CTAs route to /match-quiz", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Scope to <main> so the SiteHeader "Get started" link doesn't get matched.
  const main = page.locator("main");
  const ctas = main.getByRole("link", { name: /Let's Get Styling/i });
  const ctaCount = await ctas.count();
  expect(ctaCount).toBe(2);
  for (let i = 0; i < ctaCount; i++) {
    await expect(ctas.nth(i)).toHaveAttribute("href", "/match-quiz");
  }
});

test("/ Find Your Best Match CTA routes guests to /match-quiz", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const findMatch = page.getByRole("link", { name: /Find Your Best Match/i });
  await expect(findMatch).toHaveAttribute("href", "/match-quiz");
});
