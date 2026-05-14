import { expect, test, type Page } from "@playwright/test";
import {
  ensureClientUser,
  cleanupE2EUserByEmail,
  getPool,
} from "./db";

/**
 * Deactivate Account — the button in /settings was a Loveable mock that
 * toasted success without touching the DB. This spec pins the new flow:
 * the server action sets User.deletedAt, the partial unique index on
 * users(email) frees the email for reuse, the user is bounced through
 * /logout, and an AuditLog row records the action.
 */

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in?e2e=1");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

test("deactivate sets User.deletedAt, writes audit, and signs the user out", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const email = `deact-${stamp}@e2e.wishi.test`;
  const clerkId = `e2e_deact_${stamp}`;

  const user = await ensureClientUser({
    clerkId,
    email,
    firstName: "Deact",
    lastName: "Subject",
  });

  try {
    await signIn(page, email);
    await page.goto("/settings");

    await page.getByRole("button", { name: /Deactivate account/i }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: /^Deactivate$/ })
      .click();

    // The action redirects to /logout, which clears auth and lands on /.
    await page.waitForURL((u) => !u.pathname.startsWith("/settings"), {
      timeout: 10_000,
    });

    const { rows } = await getPool().query(
      `SELECT deleted_at FROM users WHERE id = $1`,
      [user.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].deleted_at).not.toBeNull();

    const { rows: auditRows } = await getPool().query(
      `SELECT action FROM audit_logs WHERE actor_user_id = $1 AND action = 'user.deactivate'`,
      [user.id],
    );
    expect(auditRows.length).toBeGreaterThan(0);
  } finally {
    // Cleanup tolerates the deletedAt row — cleanupE2EUserByEmail looks up
    // by email regardless of soft-delete state.
    await cleanupE2EUserByEmail(email);
  }
});
