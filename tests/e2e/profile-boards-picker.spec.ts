import { expect, test, type Page } from "@playwright/test";
import {
  ensureStylistUser,
  ensureStylistProfile,
  cleanupStylistProfile,
  cleanupE2EUserByEmail,
  getPool,
} from "./db";

// Guards the manager UX from regressing:
//   1. + New board opens the picker, not a silent POST that creates an
//      empty Board row (the reported bug pre-fix).
//   2. Both picker options route to the sessionless creators with the
//      style query param threaded through.

async function signInAsStylist(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in?e2e=1");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

test("profile-boards +New board opens a picker that routes to sessionless creators", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const email = `profile-boards-picker-${stamp}@e2e.wishi.test`;
  const stylist = await ensureStylistUser({
    clerkId: `e2e_profile_boards_picker_${stamp}`,
    email,
    firstName: "Picker",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });
  await getPool().query(
    `UPDATE stylist_profiles
       SET style_specialties = ARRAY['Classic','Bohemian']
     WHERE user_id = $1`,
    [stylist.id],
  );

  try {
    await signInAsStylist(page, email);
    await page.goto("/stylist/profile/boards");
    await expect(
      page.getByRole("heading", { name: "Profile boards" }),
    ).toBeVisible();

    // The active style bucket defaults to the first specialty (Classic).
    // Clicking + New board opens the picker dialog instead of POSTing
    // a stub Board row to the server (the old, broken behavior).
    const boardsBefore = await getPool().query(
      `SELECT count(*) AS c FROM boards
        WHERE stylist_profile_id = (
                SELECT id FROM stylist_profiles WHERE user_id = $1)
          AND session_id IS NULL`,
      [stylist.id],
    );
    await page.getByRole("button", { name: /\+ New board/ }).click();
    await expect(
      page.getByRole("heading", { name: "What do you want to create?" }),
    ).toBeVisible();
    const boardsAfter = await getPool().query(
      `SELECT count(*) AS c FROM boards
        WHERE stylist_profile_id = (
                SELECT id FROM stylist_profiles WHERE user_id = $1)
          AND session_id IS NULL`,
      [stylist.id],
    );
    expect(Number(boardsAfter.rows[0].c)).toBe(Number(boardsBefore.rows[0].c));

    // Moodboard path threads the active style label through the query string.
    await page.getByRole("link", { name: /Moodboard/ }).click();
    await expect(page).toHaveURL(
      /\/stylist\/profile\/boards\/new\/moodboard\?style=Classic/,
    );

    await page.goBack();
    await page.getByRole("button", { name: /\+ New board/ }).click();
    await page.getByRole("link", { name: /Styleboard/ }).click();
    await expect(page).toHaveURL(
      /\/stylist\/profile\/boards\/new\/styleboard\?style=Classic/,
    );
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(email);
  }
});
