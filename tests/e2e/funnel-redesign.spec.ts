import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  createMatchQuizResult,
  disconnectTestDb,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
} from "./db";

/**
 * Funnel-redesign verification (Wave A of the post-Phase-10 design refresh):
 * - Public /match-quiz onboarding flow renders all 4 steps
 * - Authed /matches refactor renders the single-hero "Perfect Match" pattern
 *   (replacing the prior 3-card grid) when a match-quiz result exists
 *
 * Runs against `npm run dev:e2e` (port 3001, E2E_AUTH_MODE=true).
 */

test.afterAll(async () => {
  await disconnectTestDb();
});

test("/match-quiz public onboarding renders step labels and headline", async ({
  page,
}) => {
  await page.goto("/match-quiz");
  await page.waitForLoadState("networkidle");

  // Headline + first step label
  await expect(
    page.getByRole("heading", { name: /perfect style match/i }),
  ).toBeVisible();
  const body = await page.locator("body").innerText();
  expect(body).toContain("NEEDS");
  expect(body).toContain("1 / 4");
  // No locked-out copy crept in
  expect(body.toLowerCase()).not.toContain("seasonal capsule");
  expect(body.toLowerCase()).not.toContain("free shipping");
});

test("/match-quiz step 0 chips advance to step 1 (department)", async ({
  page,
}) => {
  await page.goto("/match-quiz");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: /Elevated Everyday/i }).click();
  await page.getByRole("button", { name: /^Continue$/ }).click();

  const body = await page.locator("body").innerText();
  expect(body).toContain("DEPARTMENT");
  expect(body).toContain("perfect plan for your needs");
});

test("/matches authed shows single-hero Perfect Match layout", async ({
  page,
}) => {
  const ts = Date.now();
  const clientEmail = `funnel-matches-c-${ts}@e2e.wishi.test`;
  const stylistEmail = `funnel-matches-s-${ts}@e2e.wishi.test`;
  await cleanupE2EUserByEmail(clientEmail);
  await cleanupE2EUserByEmail(stylistEmail);

  const client = await ensureClientUser({
    clerkId: `e2e_funnel_matches_c_${ts}`,
    email: clientEmail,
    firstName: "Funnel",
    lastName: "Tester",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_funnel_matches_s_${ts}`,
    email: stylistEmail,
    firstName: "Match",
    lastName: "Stylist",
  });
  await ensureStylistProfile({
    userId: stylist.id,
    matchEligible: true,
    isAvailable: true,
    genderPreference: ["FEMALE"],
    styleSpecialties: ["minimalist"],
  });
  await createMatchQuizResult({
    userId: client.id,
    genderToStyle: "FEMALE",
    styleDirection: ["minimalist"],
  });

  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(clientEmail);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).not.toHaveURL(/\/sign-in/);

    await page.goto("/matches");
    await page.waitForLoadState("networkidle");

    const body = await page.locator("body").innerText();
    // Hero copy from the new design
    expect(body).toContain("We Found Your");
    expect(body).toContain("Perfect Match");
    // Inline How-it-Works carousel from the new design
    expect(body).toContain("How it Works");
    // Old grid copy is gone
    expect(body).not.toContain("Your Top Stylists");
  } finally {
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
