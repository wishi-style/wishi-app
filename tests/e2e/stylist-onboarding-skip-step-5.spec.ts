// Profile-boards step (5) is temporarily disabled while the builder is being
// rebuilt. The wizard must:
//   1. Redirect /onboarding/5 to /onboarding/4 (matches Back-from-6 intent).
//   2. Bare /onboarding for a stylist parked on onboardingStep=5 must resume
//      onto step 6, not step 5.
//
// Without (1), a stylist clicking Back from step 6 lands on the dead route
// and the wizard appears frozen. Without (2), any historical stylist whose
// DB row sits at step 5 hits the dead route on resume and can't complete.

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

async function seedInProgressStylist(prefix: string, onboardingStep: number): Promise<Ctx> {
  const ts = Date.now() + Math.floor(Math.random() * 1_000);
  const stylistEmail = `${prefix}-stylist-${ts}@e2e.wishi.test`;
  const stylistClerkId = `e2e_${prefix}_stylist_${ts}`;

  const stylist = await ensureStylistUser({
    clerkId: stylistClerkId,
    email: stylistEmail,
    firstName: "Skip5",
    lastName: "Stylist",
  });
  await ensureStylistProfile({
    userId: stylist.id,
    genderPreference: ["FEMALE"],
  });
  await getPool().query(
    `UPDATE stylist_profiles
     SET onboarding_step = $1, onboarding_status = 'IN_PROGRESS'::"StylistOnboardingStatus"
     WHERE user_id = $2`,
    [onboardingStep, stylist.id],
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
  await page.goto("/sign-in?e2e=1");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

test("/onboarding/5 redirects to /onboarding/4 (disabled step)", async ({ page }) => {
  const ctx = await seedInProgressStylist("skip5-direct", 6);
  try {
    await signIn(page, ctx.stylist.email);
    await page.goto("/onboarding/5");
    await expect(page).toHaveURL(/\/onboarding\/4(\?|$)/);
  } finally {
    await ctx.cleanup();
  }
});

test("bare /onboarding for a stylist parked on step 5 resumes onto step 6", async ({ page }) => {
  const ctx = await seedInProgressStylist("skip5-resume", 5);
  try {
    await signIn(page, ctx.stylist.email);
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/onboarding\/6(\?|$)/);
  } finally {
    await ctx.cleanup();
  }
});
