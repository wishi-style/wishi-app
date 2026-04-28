import { expect, test } from "@playwright/test";

/**
 * /feed redesign from the post-Phase-10 design refresh.
 * - Single-column layout with max-w-2xl FeedCard (vs prior 4-column grid)
 * - Each card now has a stylist avatar + name attribution row at the top
 * - Gift-card promo banner injected after the 3rd card
 *
 * The feed pulls from real DB profile boards. Spec checks the page renders
 * + tabs are present + the gift-card banner shows whenever the rendered
 * feed has at least 3 cards (in fixtureless local runs the feed is often
 * empty, in which case the banner check is conditionally skipped).
 */

test("/feed renders header, tabs, and either feed cards or empty state", async ({ page }) => {
  await page.goto("/feed");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { name: "Feed" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Womenswear", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Menswear", exact: true })).toBeVisible();

  // Either the empty-state copy or at least one card must render
  const empty = page.getByText(/No looks yet\. Check back soon\./i);
  const articles = page.locator("article");
  await expect.poll(async () => {
    if (await empty.isVisible().catch(() => false)) return "empty";
    if ((await articles.count()) > 0) return "cards";
    return "neither";
  }).toMatch(/empty|cards/);
});

test("/feed gift-card promo banner injects when feed has >=3 cards", async ({ page }) => {
  await page.goto("/feed");
  await page.waitForLoadState("networkidle");

  const articleCount = await page.locator("article").count();
  if (articleCount < 3) {
    test.skip(true, `Need >=3 feed cards to verify the gift-card injection (have ${articleCount})`);
    return;
  }

  await expect(page.getByText(/Give the gift of style/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Buy gift card/i })).toHaveAttribute(
    "href",
    "/gift-cards",
  );
});
