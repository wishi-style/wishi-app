import { expect, test } from "@playwright/test";

/**
 * /feed Loveable parity:
 *   - "Stylist Looks" centered header + Womenswear/Menswear pill toggle
 *   - Two-column FeedCard (look on left, product grid on right at md+)
 *   - Title bar at top (italic display) + Book {firstname} CTA at bottom
 *   - Gift-card promo banner injected after the 3rd card
 *
 * Feed pulls from real DB profile boards; in fixtureless local runs the
 * feed is often empty, so card-shape checks gate on count > 0.
 */

test("/feed renders Loveable header (Stylist Looks) + pill tabs + cards-or-empty", async ({
  page,
}) => {
  await page.goto("/feed");
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("heading", { name: "Stylist Looks" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Womenswear", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Menswear", exact: true }),
  ).toBeVisible();

  const empty = page.getByText(/No looks yet\. Check back soon\./i);
  const articles = page.locator("article");
  await expect
    .poll(async () => {
      if (await empty.isVisible().catch(() => false)) return "empty";
      if ((await articles.count()) > 0) return "cards";
      return "neither";
    })
    .toMatch(/empty|cards/);
});

test("/feed FeedCard exposes Loveable's Book {firstname} CTA when cards render", async ({
  page,
}) => {
  await page.goto("/feed");
  await page.waitForLoadState("networkidle");

  const articleCount = await page.locator("article").count();
  if (articleCount === 0) {
    test.skip(
      true,
      "Need at least one feed card to verify the Book CTA shape",
    );
    return;
  }

  // Loveable's CTA: lowercase "book {firstname}" pointing to the booking
  // funnel (/select-plan?stylistId=…). At least one card must expose it.
  const bookLinks = page.locator(
    'a[href^="/select-plan?stylistId="]:has-text("book ")',
  );
  await expect(bookLinks.first()).toBeVisible();
});

test("/feed gift-card promo banner injects when feed has >=3 cards", async ({
  page,
}) => {
  await page.goto("/feed");
  await page.waitForLoadState("networkidle");

  const articleCount = await page.locator("article").count();
  if (articleCount < 3) {
    test.skip(
      true,
      `Need >=3 feed cards to verify the gift-card injection (have ${articleCount})`,
    );
    return;
  }

  await expect(page.getByText(/Give the gift of style/i)).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Buy gift card/i }),
  ).toHaveAttribute("href", "/gift-cards");
});
