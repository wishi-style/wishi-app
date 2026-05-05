import { expect, test, type Page } from "@playwright/test";
import {
  ensureStylistUser,
  ensureStylistProfile,
  cleanupStylistProfile,
  cleanupE2EUserByEmail,
  getPool,
} from "./db";

// /stylist/profile previously saved to localStorage only. This spec
// guards the new server-action persistence path: edit text fields →
// click Save changes → assert redirect to /stylist/dashboard, toast,
// AND that a refresh hydrates the saved values from the database (not
// localStorage, which a fresh context will NOT have).

async function signInAsStylist(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

test("stylist profile save persists to DB and hydrates after refresh", async ({
  browser,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const stylistEmail = `profile-save-${stamp}@e2e.wishi.test`;

  const stylist = await ensureStylistUser({
    clerkId: `e2e_profile_save_${stamp}`,
    email: stylistEmail,
    firstName: "Initial",
    lastName: "Name",
  });
  await ensureStylistProfile({ userId: stylist.id });
  // The form requires a profile picture + moodboard image. Pre-seed both
  // so the validation gate doesn't block save when this spec only
  // exercises the text fields. Real S3 uploads are covered by the unit
  // tests on uploadIfDataUrl + the integration test on setProfileMoodboard.
  await getPool().query(
    `UPDATE users SET avatar_url = $2 WHERE id = $1`,
    [stylist.id, "https://placehold.co/256x256.jpg"],
  );
  const moodboardId = `e2e_pmb_${stamp}`;
  const profileId = (
    await getPool().query(`SELECT id FROM stylist_profiles WHERE user_id = $1`, [stylist.id])
  ).rows[0].id;
  await getPool().query(
    `INSERT INTO boards (id, type, stylist_profile_id, is_featured_on_profile, created_at, updated_at)
     VALUES ($1, 'MOODBOARD', $2, true, NOW(), NOW())`,
    [moodboardId, profileId],
  );
  await getPool().query(
    `INSERT INTO board_photos (id, board_id, s3_key, url, order_index, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 0, NOW(), NOW())`,
    [`e2e_pmbp_${stamp}`, moodboardId, "seed/key", "https://placehold.co/512x512.jpg"],
  );
  await getPool().query(
    `UPDATE stylist_profiles SET profile_moodboard_id = $2 WHERE id = $1`,
    [profileId, moodboardId],
  );

  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  try {
    await signInAsStylist(page, stylistEmail);
    await page.goto("/stylist/profile");

    // Page loads in edit mode for stylists who haven't published yet.
    await expect(page.getByText(/Edit your profile|Build your stylist profile/i)).toBeVisible();

    const fullName = `Saved Name ${stamp}`;
    const location = `Brooklyn, NY`;
    const philosophy = `Quiet luxury with edge — minimal palette, intentional silhouettes ${stamp}.`;
    const directorsPick = `One charcoal blazer, two pairs of denim, three white tees ${stamp}.`;
    const bio = `Editorial stylist with 8 years on shoots from W to Vogue ${stamp}.`;
    const handle = `wishi_${stamp.replace(/[^a-z0-9]/gi, "").slice(0, 20)}`;

    await page.getByPlaceholder(/Mika Kowalski/).fill(fullName);
    await page.getByPlaceholder("City, Country").fill(location);
    await page.getByPlaceholder(/What you stand for/).fill(philosophy);
    await page.getByPlaceholder(/signature look/).fill(directorsPick);
    await page.getByPlaceholder(/short bio/).fill(bio);
    await page.getByPlaceholder("@yourhandle").fill(`@${handle}`);

    await page.getByRole("button", { name: /Save changes|Create profile/ }).click();

    await expect(page).toHaveURL(/\/stylist\/dashboard/, { timeout: 10000 });

    // DB was actually written (not just localStorage)
    const { rows: userRows } = await getPool().query(
      `SELECT first_name, last_name FROM users WHERE id = $1`,
      [stylist.id],
    );
    expect(userRows[0].first_name).toBe(fullName.split(" ")[0]);
    expect(userRows[0].last_name).toBe(fullName.split(" ").slice(1).join(" "));

    const { rows: profileRows } = await getPool().query(
      `SELECT bio, philosophy, director_pick, instagram_handle
         FROM stylist_profiles WHERE user_id = $1`,
      [stylist.id],
    );
    expect(profileRows[0].bio).toBe(bio);
    expect(profileRows[0].philosophy).toBe(philosophy);
    expect(profileRows[0].director_pick).toBe(directorsPick);
    expect(profileRows[0].instagram_handle).toBe(handle);

    const { rows: locRows } = await getPool().query(
      `SELECT city, state FROM user_locations WHERE user_id = $1 AND is_primary = true`,
      [stylist.id],
    );
    expect(locRows[0].city).toBe("Brooklyn");
    expect(locRows[0].state).toBe("NY");

    // Fresh browser context — proves hydration is from DB, not localStorage.
    const freshCtx = await browser.newContext();
    const freshPage = await freshCtx.newPage();
    try {
      await signInAsStylist(freshPage, stylistEmail);
      await freshPage.goto("/stylist/profile");
      await expect(freshPage.getByDisplayValue(fullName)).toBeVisible();
      await expect(freshPage.getByDisplayValue(philosophy)).toBeVisible();
    } finally {
      await freshCtx.close();
    }
  } finally {
    await ctx.close();
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
