// Regression: a stylist who already finished onboarding should NEVER be
// shown the wizard again, even when an admin's re-invite link points
// directly at /onboarding/1. Without the gate, Q1's Continue button would
// overwrite her gender_preference and bounce her to /stylist/dashboard with
// every later question silently skipped.
//
// The fix is two-part:
//   1. The admin invite redirectUrl now points at /onboarding (bare), which
//      calls resume() and forwards completed profiles to the dashboard.
//   2. /onboarding/[step]/page.tsx mirrors that gate as defense-in-depth so
//      any path into a numbered step URL still routes correctly.
//
// This spec covers (2) — landing directly on /onboarding/<N> bypasses (1)
// entirely, so the page-level gate is the load-bearing check.

import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  disconnectTestDb,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
} from "./db";

test.afterAll(async () => {
  await disconnectTestDb();
});

interface Ctx {
  stylist: { id: string; email: string };
  cleanup: () => Promise<void>;
}

async function seedCompletedStylist(
  prefix: string,
  status: "ELIGIBLE" | "AWAITING_ELIGIBILITY",
): Promise<Ctx> {
  const ts = Date.now() + Math.floor(Math.random() * 1_000);
  const stylistEmail = `${prefix}-stylist-${ts}@e2e.wishi.test`;
  const stylistClerkId = `e2e_${prefix}_stylist_${ts}`;

  const stylist = await ensureStylistUser({
    clerkId: stylistClerkId,
    email: stylistEmail,
    firstName: "Reinvite",
    lastName: "Stylist",
  });
  await ensureStylistProfile({
    userId: stylist.id,
    genderPreference: ["FEMALE"],
  });
  // Promote the profile to "wizard complete" so the page-level gate fires.
  await getPool().query(
    `UPDATE stylist_profiles
     SET onboarding_step = 12, onboarding_status = $1::"StylistOnboardingStatus"
     WHERE user_id = $2`,
    [status, stylist.id],
  );

  return {
    stylist: { id: stylist.id, email: stylistEmail },
    async cleanup() {
      await cleanupStylistProfile(stylist.id);
      await cleanupE2EUserByEmail(stylistEmail);
    },
  };
}

async function signIn(page: import("@playwright/test").Page, email: string) {
  // `?e2e=1` opts into the test-only email form. Without it, the route
  // mounts Clerk's component which we can't drive headlessly. The
  // E2E_AUTH_MODE backdoor sets E2E_CLERK_ID_COOKIE on submit.
  await page.goto("/sign-in?e2e=1");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

async function readGenderPreference(userId: string): Promise<string[]> {
  // pg parses custom-enum arrays as the raw Postgres literal `'{FEMALE,MALE}'`
  // rather than a JS array. Strip the braces and split.
  const { rows } = await getPool().query(
    `SELECT gender_preference FROM stylist_profiles WHERE user_id = $1`,
    [userId],
  );
  const raw = rows[0]?.gender_preference;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as string[];
  const inner = String(raw).replace(/^\{|\}$/g, "");
  return inner === "" ? [] : inner.split(",");
}

test("ELIGIBLE stylist hitting /onboarding/1 bounces to /stylist/dashboard without overwriting gender", async ({
  page,
}) => {
  const ctx = await seedCompletedStylist("reinvite-eligible", "ELIGIBLE");
  try {
    await signIn(page, ctx.stylist.email);
    await page.goto("/onboarding/1");
    await expect(page).toHaveURL(/\/stylist\/dashboard/);

    // Q1's Continue button never had a chance to fire — her existing
    // gender_preference must be intact.
    expect(await readGenderPreference(ctx.stylist.id)).toEqual(["FEMALE"]);
  } finally {
    await ctx.cleanup();
  }
});

test("AWAITING_ELIGIBILITY stylist hitting /onboarding/1 also bounces to dashboard", async ({
  page,
}) => {
  const ctx = await seedCompletedStylist(
    "reinvite-awaiting",
    "AWAITING_ELIGIBILITY",
  );
  try {
    await signIn(page, ctx.stylist.email);
    await page.goto("/onboarding/1");
    await expect(page).toHaveURL(/\/stylist\/dashboard/);
    expect(await readGenderPreference(ctx.stylist.id)).toEqual(["FEMALE"]);
  } finally {
    await ctx.cleanup();
  }
});

test("bare /onboarding entry forwards completed stylists to the dashboard", async ({
  page,
}) => {
  // Sanity check on the resume() path the new invite redirectUrl exercises.
  const ctx = await seedCompletedStylist("reinvite-bare", "ELIGIBLE");
  try {
    await signIn(page, ctx.stylist.email);
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/stylist\/dashboard/);
  } finally {
    await ctx.cleanup();
  }
});
