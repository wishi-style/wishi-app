import { expect, test } from "@playwright/test";
import {
  ensureStylistUser,
  ensureStylistProfile,
  cleanupStylistProfile,
  cleanupE2EUserByEmail,
  getPool,
} from "./db";
import {
  installFailureGuards,
  expectNoErrorBoundary,
  gotoAndAssertOk,
} from "./fixtures/traversal";

/**
 * Anon traversal — walks every public-facing route an unauthenticated
 * visitor can reach and clicks the primary CTA on each. Fails on any 5xx,
 * any uncaught pageerror, and any rendered error.tsx body copy.
 *
 * The "Meet [Name]" → "/stylists/[id]" hop in particular is the path that
 * shipped a regression in PR #52: the page server-component called an
 * unguarded `listStylistReviews` aggregator that crashed on certain seed
 * data and bounced the visitor to the root error boundary. No previous
 * spec clicked the Meet button after asserting the directory rendered, so
 * this spec exists to lock that hop down for good.
 */

test.describe("anon traversal — every public route renders without an error boundary", () => {
  test("static marketing pages all render their primary CTA cleanly", async ({
    page,
  }) => {
    installFailureGuards(page);

    // Each entry: [path, primary-CTA-text-pattern]. The CTA must be visible;
    // we click it later in dedicated tests where the destination matters.
    const surfaces: Array<[string, RegExp]> = [
      ["/", /Let's Get Styling|Find Your Best Match/i],
      ["/pricing", /Let's Get Styling/i],
      ["/how-it-works", /Let's Get Styling|Get Started/i],
      ["/lux", /Get Started|Let's Get Styling/i],
      ["/feed", /Womenswear|Menswear|Tap a card/i],
      ["/reviews", /What our clients say|reviews/i],
      ["/gift-cards", /Buy Gift Card|Buy a Gift Card/i],
    ];

    for (const [path, ctaPattern] of surfaces) {
      await gotoAndAssertOk(page, path);
      await expect(
        page.getByText(ctaPattern).first(),
        `${path} should expose its primary CTA`,
      ).toBeVisible();
    }
  });

  test("'Let's Get Styling' CTA on every marketing page lands on a renderable destination", async ({
    page,
  }) => {
    installFailureGuards(page);

    // Regression cover for /welcome — every primary CTA on the marketing
    // pages hardcodes href="/welcome", and that route was missing for
    // months until this PR added a redirect stub. Asserting the CTA is
    // *visible* (the previous behavior) silently passed even when clicking
    // it bounced authed users to the global "Try again" boundary. This
    // test actually clicks each CTA and asserts the destination renders.
    // Each entry: [path, link-name-regex]. /lux uses "Get Started"; the
    // others use "Let's Get Styling". Both bind to href="/welcome".
    const pages: Array<[string, RegExp]> = [
      ["/", /Let's Get Styling/i],
      ["/pricing", /Let's Get Styling/i],
      ["/how-it-works", /Let's Get Styling/i],
      ["/lux", /Get Started/i],
    ];
    for (const [path, ctaName] of pages) {
      await gotoAndAssertOk(page, path);
      const cta = page.getByRole("link", { name: ctaName }).first();
      await expect(cta, `${path} exposes its primary CTA`).toBeVisible();
      // Sanity: the CTA still binds to /welcome — if a future redesign
      // changes that, this test should still verify the destination, not
      // the href specifically.
      await cta.click();
      await page.waitForLoadState("networkidle");
      await expectNoErrorBoundary(page);
      // The funnel destination is allowed to vary (currently /match-quiz
      // for anon, /stylists for authed) — what's NOT allowed is the URL
      // staying on /welcome (which means the redirect didn't fire) or
      // landing on the root error boundary (which means it crashed).
      const url = page.url();
      expect(
        url,
        `${path} → primary CTA left the user stranded on /welcome`,
      ).not.toMatch(/\/welcome(\?|$|#)/);
    }
  });

  test("/stylists list → click 'Meet [Name]' → profile renders without 'Try again'", async ({
    page,
  }) => {
    installFailureGuards(page);

    // Seed a deterministic stylist so we can find their card by name.
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const stylistEmail = `anon-trav-stylist-${stamp}@e2e.wishi.test`;
    const firstName = `Atlas${stamp.slice(-4)}`;

    const stylist = await ensureStylistUser({
      clerkId: `e2e_anon_trav_${stamp}`,
      email: stylistEmail,
      firstName,
      lastName: "Public",
    });
    const profile = await ensureStylistProfile({
      userId: stylist.id,
      styleSpecialties: ["minimalist"],
    });
    // Stamp a bio so the Meet section actually renders (the page hides the
    // Meet block entirely when bio/philosophy/directorPick are all null).
    await getPool().query(
      `UPDATE stylist_profiles SET bio = $2 WHERE id = $1`,
      [profile.id, "Wardrobe builder for everyday confidence."],
    );

    try {
      await gotoAndAssertOk(page, "/stylists");

      // Listing renders the seeded stylist
      const card = page
        .getByRole("link", { name: new RegExp(`Meet ${firstName}`, "i") })
        .first();
      await expect(card).toBeVisible();

      // Click through — this is the exact hop that broke in production.
      await Promise.all([page.waitForLoadState("networkidle"), card.click()]);
      await expect(page).toHaveURL(new RegExp(`/stylists/${profile.id}`));
      await expectNoErrorBoundary(page);

      // Profile shell is intact
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: new RegExp(`${firstName} Public`, "i"),
        }),
      ).toBeVisible();
      // Hero + sticky footer both render the Continue CTA — use .first().
      await expect(
        page
          .getByRole("link", {
            name: new RegExp(`Continue with ${firstName}`, "i"),
          })
          .first(),
      ).toBeVisible();
    } finally {
      await cleanupStylistProfile(stylist.id);
      await cleanupE2EUserByEmail(stylistEmail);
    }
  });

  test("/stylists/[id] → Continue → /bookings/new bounces anon visitor cleanly (no 'Try again')", async ({
    page,
  }) => {
    installFailureGuards(page);

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const stylistEmail = `anon-cta-stylist-${stamp}@e2e.wishi.test`;

    const stylist = await ensureStylistUser({
      clerkId: `e2e_anon_cta_${stamp}`,
      email: stylistEmail,
      firstName: "Mona",
      lastName: "Anon",
    });
    const profile = await ensureStylistProfile({ userId: stylist.id });

    try {
      await gotoAndAssertOk(page, `/stylists/${profile.id}`);

      const cta = page.getByRole("link", { name: /Continue with Mona/i }).first();
      await expect(cta).toHaveAttribute(
        "href",
        `/bookings/new?stylistId=${profile.id}`,
      );

      await cta.click();
      await page.waitForLoadState("networkidle");

      // Either the (client) layout's requireRole bounces to /sign-in, or the
      // route renders a 401-style page — both are acceptable, the only thing
      // that's NOT acceptable is the global "Try again" boundary.
      await expectNoErrorBoundary(page);
    } finally {
      await cleanupStylistProfile(stylist.id);
      await cleanupE2EUserByEmail(stylistEmail);
    }
  });

  test("/sign-in and /sign-up render without error boundary", async ({ page }) => {
    installFailureGuards(page);
    await gotoAndAssertOk(page, "/sign-in");
    await expect(page.getByLabel("Email")).toBeVisible();
    await gotoAndAssertOk(page, "/sign-up");
  });

  test("404 page renders for unknown stylist id without bouncing to root error", async ({
    page,
  }) => {
    installFailureGuards(page);

    // Use a syntactically valid cuid that won't match any real row. The page
    // should call notFound() and render the not-found chrome — NOT throw.
    await page.goto("/stylists/cl000000000000000000000000");
    await page.waitForLoadState("networkidle");
    await expectNoErrorBoundary(page);
    // Either the dedicated not-found.tsx or a 404 status is fine; both keep
    // the user out of the root error boundary.
  });
});
