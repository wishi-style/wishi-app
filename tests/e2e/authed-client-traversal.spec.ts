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

async function stampStyleProfile(userId: string, stamp: string): Promise<void> {
  await getPool().query(
    `INSERT INTO style_profiles (id, user_id, quiz_completed_at, quiz_answers, created_at, updated_at)
     VALUES ($1, $2, NOW(), '{}'::jsonb, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET quiz_completed_at = NOW()`,
    [`sp_${stamp}`, userId],
  );
}

test("authed client (no StyleProfile) walks /stylists → Meet → profile → Continue → /style-quiz, all renders clean", async ({
  page,
}) => {
  installFailureGuards(page);

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clientEmail = `ac-trav-noprofile-${stamp}@e2e.wishi.test`;
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

    // Authed listing renders — this is the page that, while authed, used
    // to bounce to "Try again" once the user clicked through.
    await gotoAndAssertOk(page, "/stylists");

    const meetCta = page
      .getByRole("link", { name: new RegExp(`Meet ${stylistFirst}`, "i") })
      .first();
    await expect(meetCta).toBeVisible();

    await meetCta.click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(new RegExp(`/stylists/${profile.id}`));
    await expectNoErrorBoundary(page);

    // No StyleProfile yet → Continue routes to /style-quiz
    const continueCta = page
      .getByRole("link", { name: new RegExp(`Continue with ${stylistFirst}`, "i") })
      .first();
    await expect(continueCta).toHaveAttribute(
      "href",
      `/style-quiz?stylistId=${profile.id}`,
    );

    await continueCta.click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(
      new RegExp(`/style-quiz\\?stylistId=${profile.id}`),
    );
    await expectNoErrorBoundary(page);
    // First seeded STYLE_PREFERENCE question renders
    await expect(page.getByText(/personal style/i).first()).toBeVisible();
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("authed client (StyleProfile complete) bypasses quiz: Meet → profile → Continue → /bookings/new", async ({
  page,
}) => {
  installFailureGuards(page);

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clientEmail = `ac-trav-withprofile-${stamp}@e2e.wishi.test`;
  const stylistEmail = `ac-trav-stylist2-${stamp}@e2e.wishi.test`;
  const stylistFirst = `Sage${stamp.slice(-4)}`;

  const client = await ensureClientUser({
    clerkId: `e2e_ac_trav2_${stamp}`,
    email: clientEmail,
    firstName: "Returning",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_ac_trav2_styl_${stamp}`,
    email: stylistEmail,
    firstName: stylistFirst,
    lastName: "Direct",
  });
  const profile = await ensureStylistProfile({ userId: stylist.id });
  await stampStyleProfile(client.id, stamp);

  try {
    await signIn(page, clientEmail);
    await gotoAndAssertOk(page, "/stylists");

    const meetCta = page
      .getByRole("link", { name: new RegExp(`Meet ${stylistFirst}`, "i") })
      .first();
    await meetCta.click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(new RegExp(`/stylists/${profile.id}`));
    await expectNoErrorBoundary(page);

    // Completed StyleProfile → Continue skips /style-quiz, goes to bookings.
    const continueCta = page
      .getByRole("link", { name: new RegExp(`Continue with ${stylistFirst}`, "i") })
      .first();
    await expect(continueCta).toHaveAttribute(
      "href",
      `/bookings/new?stylistId=${profile.id}`,
    );

    await continueCta.click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(
      new RegExp(`/bookings/new\\?stylistId=${profile.id}`),
    );
    await expectNoErrorBoundary(page);
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
