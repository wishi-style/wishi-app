import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  createMatchQuizResult,
  disconnectTestDb,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
} from "./db";

/**
 * Regression: the in-page "Favorites" tab on /stylists used to source from
 * `all`, which the page server component constructs to EXCLUDE the top-3
 * matched stylists. So heart-favoriting a stylist that appeared in the
 * "Your Stylists Match!" section persisted server-side but never surfaced
 * under the Favorites tab below.
 */

test.afterAll(async () => {
  await disconnectTestDb();
});

test("favoriting a matched stylist surfaces them under the Favorites tab on /stylists", async ({
  page,
}) => {
  const ts = Date.now();
  const uniqueStyle = `e2e-match-fav-${ts}`;
  const clientEmail = `fav-match-client-${ts}@e2e.wishi.test`;
  const stylistEmail = `fav-match-styl-${ts}@e2e.wishi.test`;
  const stylistLast = `MatchFav${ts}`;
  const stylistName = `Mach ${stylistLast}`;

  const client = await ensureClientUser({
    clerkId: `e2e_fav_match_client_${ts}`,
    email: clientEmail,
    firstName: "Fav",
    lastName: "Matcher",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_fav_match_styl_${ts}`,
    email: stylistEmail,
    firstName: "Mach",
    lastName: stylistLast,
  });
  await ensureStylistProfile({
    userId: stylist.id,
    matchEligible: true,
    // Unique specialty guarantees this stylist scores higher than any other
    // seeded stylist for the crafted quiz, so they land in the top-3 matched
    // section regardless of what else is in the DB.
    styleSpecialties: [uniqueStyle],
    genderPreference: ["FEMALE"],
    budgetBrackets: ["moderate"],
  });
  await createMatchQuizResult({
    userId: client.id,
    genderToStyle: "FEMALE",
    styleDirection: [uniqueStyle],
    budgetBracket: "moderate",
  });

  try {
    await page.goto("/sign-in?e2e=1");
    await page.getByLabel("Email").fill(clientEmail);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).not.toHaveURL(/\/sign-in/);

    await page.goto("/stylists");

    // Precondition: the test stylist landed in the matched ("Your Stylists
    // Match!") section, not the Discover grid below.
    const matchedHeading = page.getByRole("heading", {
      name: "Your Stylists Match!",
    });
    await expect(matchedHeading).toBeVisible();
    const matchedSection = page
      .locator("section")
      .filter({ has: matchedHeading });
    await expect(
      matchedSection.getByRole("button", { name: `Favorite ${stylistName}` }),
    ).toBeVisible();

    // Heart the matched card.
    const post = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/favorites/stylists") &&
        r.request().method() === "POST",
    );
    await matchedSection
      .getByRole("button", { name: `Favorite ${stylistName}` })
      .click();
    await expect(
      matchedSection.getByRole("button", {
        name: `Unfavorite ${stylistName}`,
      }),
    ).toBeVisible();
    await post;

    // Switch to the in-page Favorites tab.
    await page.getByRole("button", { name: "Favorites" }).click();

    // The fix: matched-card favorites must surface under the Favorites
    // tab. Before the fix, this card was invisible here because
    // `discoverList` sourced from `all` (which excludes matched stylists).
    const discoverHeading = page.getByRole("heading", {
      name: "Discover More Stylists",
    });
    const discoverSection = page
      .locator("section")
      .filter({ has: discoverHeading });
    await expect(
      discoverSection.getByRole("button", {
        name: `Unfavorite ${stylistName}`,
      }),
    ).toBeVisible();
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(stylistEmail);
    await cleanupE2EUserByEmail(clientEmail);
  }
});
