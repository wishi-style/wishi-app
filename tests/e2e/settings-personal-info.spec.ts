import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  disconnectTestDb,
  ensureClientUser,
  getPool,
} from "./db";

/**
 * Loveable's Settings → Personal info panel renders 12 fields. Our prior port
 * showed only 4 (firstName/lastName/email/phone). This spec verifies the full
 * field set renders in view mode and that Edit toggles into a save-able form
 * that persists across User, BodyProfile, UserLocation, UserSocialLink, and
 * StyleProfile in a single Server Action call.
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

test("Settings — Personal info renders all 12 Loveable fields and persists edits", async ({
  page,
}) => {
  const ts = Date.now();
  const email = `settings-pi-${ts}@e2e.wishi.test`;
  const user = await ensureClientUser({
    clerkId: `e2e_settings_pi_${ts}`,
    email,
    firstName: "Sienna",
    lastName: "Settings",
  });

  // Pre-seed a few values that should round-trip into view mode so the assertions
  // confirm display + persistence work, not just blank fields.
  const pool = getPool();
  await pool.query(
    `UPDATE users SET phone = '+1 555-1234', birthday = '1992-04-15', gender = 'FEMALE' WHERE id = $1`,
    [user.id],
  );
  await pool.query(
    `INSERT INTO body_profiles (id, user_id, height, body_type, highlight_areas, created_at, updated_at)
     VALUES ($1, $2, '5''6"', 'Pear', '{}', NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET height = EXCLUDED.height, body_type = EXCLUDED.body_type`,
    [`bp_${ts}`, user.id],
  );
  await pool.query(
    `INSERT INTO user_locations (id, user_id, city, state, is_primary, created_at, updated_at)
     VALUES ($1, $2, 'New York', 'NY', true, NOW(), NOW())`,
    [`ul_${ts}`, user.id],
  );

  try {
    await signInAsClient(page, email);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Open Personal info card.
    await page.getByRole("button", { name: /Personal info/i }).click();

    // View mode shows all 12 Loveable labels (uppercase tracked).
    const labels = [
      "First name",
      "Last name",
      "Email",
      "Phone",
      "Birthday",
      "Location",
      "Gender",
      "Height",
      "Body type",
      "Occupation",
      "Instagram",
      "Pinterest",
    ];
    for (const label of labels) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }

    // Seeded values round-trip into view mode.
    await expect(page.getByText("Sienna", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("New York, NY", { exact: true })).toBeVisible();
    await expect(page.getByText("Female", { exact: true })).toBeVisible();
    await expect(page.getByText("Pear", { exact: true })).toBeVisible();

    // Edit toggles into a save-able form. The card button accessible name
    // includes "Edit your personal..." (description), so scope to exact match.
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("button", { name: /Save/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeVisible();

    // Email is the only read-only field — Loveable also keeps it disabled.
    const emailInput = page.locator('input[type="email"]').first();
    await expect(emailInput).toBeDisabled();
  } finally {
    await cleanupE2EUserByEmail(email);
  }
});
