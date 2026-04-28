import { expect, test } from "@playwright/test";

/**
 * /lux page refresh from the post-Phase-10 design refresh.
 * - Lifestyle imagery (busy moms, executives, life updates) overlays the
 *   "Every Stage Of Your Life" cards (was text-only)
 * - Journey section uses dedicated journey-* assets (was placeholder hiw-*)
 * - New "Chat with us" Concierge banner with image + Calendly link
 * - Icon-based "Buy What You Love" callouts (Package / Truck / Gift)
 * - Wishi Lux Bag perk now ships with its own image
 *
 * Defensive: Loveable's LuxPackage update reintroduces locked-out "capsule"
 * copy in 4 places — this spec asserts the rendered DOM stays clean.
 *
 * Runs against `npm run dev:e2e` (port 3001, E2E_AUTH_MODE=true).
 */

test("/lux renders new lifestyle + journey imagery and concierge banner", async ({
  page,
}) => {
  await page.goto("/lux");
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("heading", { name: /^The LUX Experience$/i }),
  ).toBeVisible();

  const body = await page.locator("body").innerText();
  // Concierge banner from the Loveable refresh
  expect(body).toContain("Chat with us");
  expect(body).toContain("Schedule consultation");
  // Lux Bag perk + life-stage section copy preserved
  expect(body).toContain("Wishi Lux Bag");
  expect(body).toContain("Wishi Is For Every Stage Of Your Life");
  expect(body).toContain("Busy Moms");
  expect(body).toContain("Boss Ladies");
  expect(body).toContain("Life Updates");

  // New asset references in the HTML
  const html = await page.content();
  expect(html).toContain("life-busy-mom");
  expect(html).toContain("life-executives");
  expect(html).toContain("life-updates");
  expect(html).toContain("journey-call");
  expect(html).toContain("journey-closet");
  expect(html).toContain("journey-color");
  expect(html).toContain("wishi-concierge");
  expect(html).toContain("lux-gift");
});

test("/lux rendered DOM stays free of locked-out capsule + free-shipping copy", async ({
  page,
}) => {
  await page.goto("/lux");
  await page.waitForLoadState("networkidle");

  // Loveable's LuxPackage source reintroduces these in 4 spots —
  // ("Capsule Wardrobe", "Wishi capsule delivers", "8 boards, 2 capsules",
  // "Free & Priority Shipping"). This spec is the gate that catches a
  // future port that forgets to substitute.
  const body = await page.locator("body").innerText();
  expect(body.toLowerCase()).not.toContain("capsule");
  expect(body.toLowerCase()).not.toContain("free shipping");
  expect(body.toLowerCase()).not.toContain("free & priority");
  expect(body.toLowerCase()).not.toContain("virtual fitting");
});

test("/lux in-page CTAs route to the funnel-redesign /match-quiz entry", async ({
  page,
}) => {
  await page.goto("/lux");
  await page.waitForLoadState("networkidle");

  // Scope to <main> so the SiteHeader "Get started" link (which still
  // points at /match-quiz on origin/main until the funnel-redesign PR
  // lands) doesn't get matched by the same regex.
  const main = page.locator("main");
  const ctas = main.getByRole("link", { name: /Get Started|Book a Stylist|Schedule Your Free Consultation/i });
  const count = await ctas.count();
  expect(count).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < count; i++) {
    await expect(ctas.nth(i)).toHaveAttribute("href", "/match-quiz");
  }
});
