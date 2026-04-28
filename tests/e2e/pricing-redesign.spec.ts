import { expect, test } from "@playwright/test";

/**
 * /pricing redesign from the post-Phase-10 design refresh.
 * - Per-tier expandable feature accordions (replaces the static bullet list)
 * - "Compare plans" dialog opens a side-by-side feature matrix
 * - Concierge banner ("Chat with us.") + How-it-Works section appended
 *
 * Defensive: Loveable's Pricing source still lists three locked-out features
 * in Lux ("Two seasonal capsules", "Virtual fitting room", "Free & Priority
 * Shipping"). This spec is the gate that catches a future port that forgets
 * to substitute.
 *
 * Runs against `npm run dev:e2e` (port 3001, E2E_AUTH_MODE=true).
 */

test("/pricing renders 3 tier cards with prices from lib/plans + accordions", async ({
  page,
}) => {
  await page.goto("/pricing");
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("heading", { name: /Find Your Perfect Plan/i }),
  ).toBeVisible();

  const body = await page.locator("body").innerText();
  // Tier names + prices come from lib/plans + lib/ui/plan-copy
  expect(body).toContain("Wishi Mini");
  expect(body).toContain("Wishi Major");
  expect(body).toContain("Wishi Lux");
  expect(body).toContain("$60");
  expect(body).toContain("$130");
  expect(body).toContain("$550");
  expect(body).toContain("$20");

  // Accordion feature titles (closed by default — the title is visible but
  // the description only renders when expanded).
  expect(body).toContain("1:1 chat with your stylist");
  expect(body).toContain("A Mood Board to define your style direction");
  expect(body).toContain("Up to 8 curated Style Boards");

  // Concierge banner + How-it-Works appended sections
  expect(body).toContain("Chat with us");
  expect(body).toContain("Schedule consultation");
  expect(body).toContain("How it Works");
});

test("/pricing Compare plans dialog opens with the side-by-side matrix", async ({
  page,
}) => {
  await page.goto("/pricing");
  await page.waitForLoadState("networkidle");

  // Trigger
  await page.getByRole("button", { name: /Compare plans/i }).click();

  // The dialog renders the matrix
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Compare plans/i).first()).toBeVisible();
  // Matrix has tier headers + at least one row
  const dialogText = await dialog.innerText();
  expect(dialogText).toContain("Mini");
  expect(dialogText).toContain("Major");
  expect(dialogText).toContain("Lux");
  expect(dialogText).toContain("Style Boards");
  expect(dialogText).toContain("30-min intro video call");
});

test("/pricing rendered DOM stays free of locked-out copy", async ({ page }) => {
  await page.goto("/pricing");
  await page.waitForLoadState("networkidle");

  // Open the dialog so its DOM is in the page too — the gate must cover both
  // the per-tier accordions AND the compare matrix.
  await page.getByRole("button", { name: /Compare plans/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const html = await page.content();
  expect(html.toLowerCase()).not.toContain("capsule");
  expect(html.toLowerCase()).not.toContain("free shipping");
  expect(html.toLowerCase()).not.toContain("free & priority");
  expect(html.toLowerCase()).not.toContain("virtual fitting");
});

test("/pricing tier CTAs route to the funnel-redesign /match-quiz entry", async ({
  page,
}) => {
  await page.goto("/pricing");
  await page.waitForLoadState("networkidle");

  // Scope to <main> so the SiteHeader "Get started" link (which still
  // points at /match-quiz on origin/main until the funnel-redesign PR
  // lands) doesn't get matched.
  const main = page.locator("main");
  const ctas = main.getByRole("link", { name: /Let's Get Styling/i });
  const count = await ctas.count();
  expect(count).toBe(3);
  for (let i = 0; i < count; i++) {
    await expect(ctas.nth(i)).toHaveAttribute("href", "/match-quiz");
  }
});
