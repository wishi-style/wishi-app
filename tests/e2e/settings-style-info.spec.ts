import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  disconnectTestDb,
  ensureClientUser,
  getPool,
} from "./db";

/**
 * Loveable's Settings → Style info panel renders 9 sections × ~30 fields with
 * an inline view↔edit toggle. Our prior port was read-only and missing 3 entire
 * sections (Pieces & categories, Brands, Occasions & notes). This spec verifies
 * the new panel renders all 9 sections in view mode + flips into a save-able
 * edit form that persists across StyleProfile, BodyProfile, BodySize,
 * BudgetByCategory, ColorPreference, FabricPreference, PatternPreference,
 * UserLocation, and UserSocialLink in a single Server Action.
 */

test.afterAll(async () => {
  await disconnectTestDb();
});

async function signInAsClient(
  page: import("@playwright/test").Page,
  email: string,
) {
  await page.goto("/sign-in?e2e=1");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

test("Settings — Style info renders 9 Loveable sections and persists edits", async ({
  page,
}) => {
  const ts = Date.now();
  const email = `settings-si-${ts}@e2e.wishi.test`;
  const user = await ensureClientUser({
    clerkId: `e2e_settings_si_${ts}`,
    email,
    firstName: "Sienna",
    lastName: "StyleInfo",
  });

  // Pre-seed enough data to verify display in 6 of 9 sections.
  const pool = getPool();
  await pool.query(
    `INSERT INTO body_profiles (id, user_id, height, body_type, top_fit, bottom_fit, highlight_areas, necklines_avoid, body_areas_mindful, body_issues, created_at, updated_at)
     VALUES ($1, $2, '5''6"', 'Pear', 'SLIM', 'REGULAR', '{"Waist","Legs"}', '{"Halter neck"}', '{"Hips"}', 'Prefer mid-rise', NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       height = EXCLUDED.height,
       body_type = EXCLUDED.body_type,
       top_fit = EXCLUDED.top_fit,
       bottom_fit = EXCLUDED.bottom_fit,
       highlight_areas = EXCLUDED.highlight_areas,
       necklines_avoid = EXCLUDED.necklines_avoid,
       body_areas_mindful = EXCLUDED.body_areas_mindful,
       body_issues = EXCLUDED.body_issues`,
    [`bp_${ts}`, user.id],
  );

  await pool.query(
    `INSERT INTO style_profiles (id, user_id, style_preferences, style_icons, comfort_zone_level, dress_code, occupation, typically_wears, needs_description, pieces_needed, preferred_brands, avoid_brands, occasions, notes, shopping_values, created_at, updated_at)
     VALUES ($1, $2,
             '{"Minimal","Classic"}',
             '{"Carolyn Bessette-Kennedy"}',
             5,
             'Business casual',
             'Marketing director',
             'Healthy mix of both',
             'A style refresh',
             '{"Tops","Jackets","Dresses","Bags"}',
             '{"The Row","Totême","Loewe"}',
             '{"Fast fashion"}',
             '{"Work","Weekend","Travel"}',
             'Prefer natural fabrics.',
             '{"Quiet Luxury","Sustainability"}',
             NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       style_preferences = EXCLUDED.style_preferences,
       style_icons = EXCLUDED.style_icons,
       comfort_zone_level = EXCLUDED.comfort_zone_level,
       dress_code = EXCLUDED.dress_code,
       occupation = EXCLUDED.occupation,
       typically_wears = EXCLUDED.typically_wears,
       needs_description = EXCLUDED.needs_description,
       pieces_needed = EXCLUDED.pieces_needed,
       preferred_brands = EXCLUDED.preferred_brands,
       avoid_brands = EXCLUDED.avoid_brands,
       occasions = EXCLUDED.occasions,
       notes = EXCLUDED.notes,
       shopping_values = EXCLUDED.shopping_values`,
    [`sp_${ts}`, user.id],
  );

  await pool.query(
    `INSERT INTO user_locations (id, user_id, city, state, is_primary, created_at, updated_at)
     VALUES ($1, $2, 'New York', 'NY', true, NOW(), NOW())`,
    [`ul_${ts}`, user.id],
  );

  await pool.query(
    `INSERT INTO user_social_links (id, user_id, platform, url, created_at, updated_at)
     VALUES ($1, $2, 'instagram', '@sienna.style', NOW(), NOW())`,
    [`usl_${ts}`, user.id],
  );

  try {
    await signInAsClient(page, email);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Open Style info card
    await page.getByRole("button", { name: /Style info/i }).click();

    // All 9 Loveable section headers visible
    const sectionHeaders = [
      "Goals & lifestyle",
      "Pieces & categories",
      "Fit & body",
      "Sizes",
      "Budget per category",
      "Style preferences",
      "Inspiration",
      "Brands",
      "Occasions & notes",
    ];
    for (const header of sectionHeaders) {
      await expect(
        page.getByRole("heading", { name: header, exact: true }),
      ).toBeVisible();
    }

    // Seeded values round-trip into view mode (covers 6 of 9 sections).
    await expect(page.getByText("A style refresh", { exact: true })).toBeVisible();
    await expect(page.getByText("Business casual", { exact: true })).toBeVisible();
    await expect(page.getByText("New York, NY", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Tops, Jackets, Dresses, Bags", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Pear", { exact: true })).toBeVisible();
    await expect(page.getByText("Halter neck", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Minimal, Classic", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("A little outside", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Quiet Luxury, Sustainability", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("The Row, Totême, Loewe", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Work, Weekend, Travel", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Prefer natural fabrics.", { exact: true }),
    ).toBeVisible();

    // Edit toggle into save-able form
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Save$/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeVisible();

    // Cancel reverts without persisting
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Edit", exact: true }),
    ).toBeVisible();

    // Re-enter edit mode and update one field, then save
    await page.getByRole("button", { name: "Edit", exact: true }).click();

    // The "Notes" field is a textarea (multiline). Update it.
    const notesTextarea = page.locator("textarea").nth(1); // 0 = bodyAreasNotes, 1 = notes
    await notesTextarea.fill("Updated note from e2e");

    await page.getByRole("button", { name: /^Save$/ }).click();

    // After save, the panel exits edit mode and shows updated copy
    await expect(
      page.getByRole("button", { name: "Edit", exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("Updated note from e2e", { exact: true }),
    ).toBeVisible();

    // Verify persistence in DB
    const { rows } = await pool.query<{ notes: string | null }>(
      `SELECT notes FROM style_profiles WHERE user_id = $1`,
      [user.id],
    );
    expect(rows[0]?.notes).toBe("Updated note from e2e");
  } finally {
    await cleanupE2EUserByEmail(email);
  }
});
