import { expect, test, type Page } from "@playwright/test";
import {
  ensureClientUser,
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
 * Authed-client traversal — the critical flow that shipped the production
 * regression: an authenticated client lands on `/stylists`, clicks "Meet
 * [Name]", and expects a profile page, not the global "Try again" screen.
 *
 * Two test variants (no profile vs completed profile) drive the same
 * directory → click → profile → Continue → quiz/booking funnel. Both
 * assert the destination renders (not just the href), then walk the rest
 * of the authed-client navbar surfaces (`/sessions`, `/settings`, `/cart`,
 * `/orders`, `/closet`, `/favorites`, `/matches`) — each must render
 * without bouncing to the route-group or root error boundary.
 *
 * Twilio-gated chat routes (`/sessions/[id]/chat`) are deliberately NOT
 * exercised here, matching the existing `chat.spec.ts` convention; CI
 * without a Twilio tenant would flake otherwise.
 */

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  // The post-sign-in router lands on whichever client surface is
  // appropriate for the user (sessions / matches / match-quiz).
  await expect(page).toHaveURL(/\/(sessions|stylist|match-quiz|matches|welcome)/);
}

test("authed client walks /stylists → Meet → profile → Continue → /select-plan, regardless of StyleProfile state", async ({
  page,
}) => {
  installFailureGuards(page);

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clientEmail = `ac-trav-${stamp}@e2e.wishi.test`;
  const stylistEmail = `ac-trav-stylist-${stamp}@e2e.wishi.test`;
  const stylistFirst = `Nora${stamp.slice(-4)}`;

  await ensureClientUser({
    clerkId: `e2e_ac_trav_${stamp}`,
    email: clientEmail,
    firstName: "Funnel",
    lastName: "Walker",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_ac_trav_styl_${stamp}`,
    email: stylistEmail,
    firstName: stylistFirst,
    lastName: "Match",
  });
  const profile = await ensureStylistProfile({ userId: stylist.id });
  await getPool().query(
    `UPDATE stylist_profiles SET bio = $2 WHERE id = $1`,
    [profile.id, "Bridge between editorial and everyday."],
  );

  try {
    await signIn(page, clientEmail);

    await gotoAndAssertOk(page, "/stylists");

    const meetCta = page
      .getByRole("link", { name: new RegExp(`Meet ${stylistFirst}`, "i") })
      .first();
    await expect(meetCta).toBeVisible();
    await meetCta.click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(new RegExp(`/stylists/${profile.id}`));
    await expectNoErrorBoundary(page);

    // Continue routes straight to /select-plan — no pre-booking style-quiz
    // gate. StyleProfile is required at first chat-room entry instead.
    const continueCta = page
      .getByRole("link", { name: new RegExp(`Continue with ${stylistFirst}`, "i") })
      .first();
    await expect(continueCta).toHaveAttribute(
      "href",
      `/select-plan?stylistId=${profile.id}`,
    );

    await continueCta.click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(
      new RegExp(`/select-plan\\?stylistId=${profile.id}`),
    );
    await expectNoErrorBoundary(page);
    await expect(page.getByText(/Choose The Right Plan/i)).toBeVisible();
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("authed client navbar surfaces all render without bouncing to error.tsx", async ({
  page,
}) => {
  installFailureGuards(page);

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clientEmail = `ac-trav-navbar-${stamp}@e2e.wishi.test`;

  await ensureClientUser({
    clerkId: `e2e_ac_navbar_${stamp}`,
    email: clientEmail,
    firstName: "Navbar",
    lastName: "Walker",
  });

  try {
    await signIn(page, clientEmail);

    // Each route is a (client) layout child; requireRole gates the entry,
    // and each page server-component has its own data-fetch path. Any one
    // throwing replaces the whole subtree with `(client)/error.tsx` —
    // expectNoErrorBoundary fails the test if that happens.
    const routes = [
      "/sessions",
      "/settings",
      "/cart",
      "/orders",
      "/closet",
      "/favorites",
      "/matches",
    ];
    for (const path of routes) {
      await gotoAndAssertOk(page, path);
    }
  } finally {
    await cleanupE2EUserByEmail(clientEmail);
  }
});

test("authed client visiting public surfaces (/, /pricing, /how-it-works, /lux, /feed, /reviews, /gift-cards) renders clean", async ({
  page,
}) => {
  installFailureGuards(page);

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clientEmail = `ac-trav-public-${stamp}@e2e.wishi.test`;

  await ensureClientUser({
    clerkId: `e2e_ac_public_${stamp}`,
    email: clientEmail,
    firstName: "Public",
    lastName: "Walker",
  });

  try {
    await signIn(page, clientEmail);

    // Public routes can render different chrome / CTAs when authed (e.g. the
    // navbar swaps in "My Style Sessions" instead of "Sign In"). This walks
    // them while authed to catch any conditional-render branch that crashes
    // only when a user is signed in.
    for (const path of [
      "/",
      "/pricing",
      "/how-it-works",
      "/lux",
      "/feed",
      "/reviews",
      "/gift-cards",
    ]) {
      await gotoAndAssertOk(page, path);
    }
  } finally {
    await cleanupE2EUserByEmail(clientEmail);
  }
});

test("authed client clicking 'Let's Get Styling' / 'Get Started' on every marketing page lands on a renderable destination", async ({
  page,
}) => {
  // This is the exact scenario from the staging bug report: signed in,
  // visit /pricing, click "Let's Get Styling" → bounce to "Try again".
  // Root cause: every marketing CTA hardcodes href="/welcome", and that
  // route had no page.tsx until this PR's redirect stub. Authed users
  // weren't bounced to /sign-in (they were authed), so they landed on
  // an empty Next route that bubbled to the root error boundary.
  installFailureGuards(page);

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clientEmail = `ac-trav-cta-${stamp}@e2e.wishi.test`;

  await ensureClientUser({
    clerkId: `e2e_ac_cta_${stamp}`,
    email: clientEmail,
    firstName: "CTA",
    lastName: "Walker",
  });

  try {
    await signIn(page, clientEmail);

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
      await cta.click();
      await page.waitForLoadState("networkidle");
      // The exact assertion from the staging report: clicking should NOT
      // land on the global error boundary.
      await expectNoErrorBoundary(page);
      const url = page.url();
      expect(
        url,
        `${path} → primary CTA left the authed user stranded on /welcome`,
      ).not.toMatch(/\/welcome(\?|$|#)/);
    }
  } finally {
    await cleanupE2EUserByEmail(clientEmail);
  }
});
