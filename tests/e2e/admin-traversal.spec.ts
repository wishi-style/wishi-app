import { expect, test, type Page } from "@playwright/test";
import {
  ensureAdminUser,
  ensureClientUser,
  ensureStylistUser,
  ensureStylistProfile,
  createSessionForClient,
  cleanupStylistProfile,
  cleanupE2EUserByEmail,
} from "./db";
import {
  installFailureGuards,
  expectNoErrorBoundary,
  gotoAndAssertOk,
} from "./fixtures/traversal";

/**
 * Admin traversal — signs in as an ADMIN user and walks every primary
 * `/admin/*` index plus a representative detail page on the strict path
 * (users → user detail, sessions → session detail). Asserts each surface
 * renders without bouncing to `(admin)/error.tsx` or the root boundary.
 *
 * Existing `admin.spec.ts` already covers some of these as a smoke test;
 * this spec layers on `expectNoErrorBoundary` and detail-page navigation
 * so we catch render-time crashes that the older "no '403' in body" check
 * would miss.
 */

async function signInAsAdmin(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  // Admin sign-in lands wherever the post-signin router decides; we don't
  // care, we navigate explicitly next.
  await page.waitForLoadState("networkidle");
}

test("admin walks every /admin/* index + drills into a user detail and a session detail", async ({
  page,
}) => {
  installFailureGuards(page);

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const adminEmail = `admin-trav-${stamp}@e2e.wishi.test`;
  const clientEmail = `admin-trav-c-${stamp}@e2e.wishi.test`;
  const stylistEmail = `admin-trav-s-${stamp}@e2e.wishi.test`;

  const admin = await ensureAdminUser({
    clerkId: `e2e_admin_trav_${stamp}`,
    email: adminEmail,
    firstName: "Admin",
    lastName: "Walker",
  });
  const client = await ensureClientUser({
    clerkId: `e2e_admin_trav_c_${stamp}`,
    email: clientEmail,
    firstName: "Audit",
    lastName: "Subject",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_admin_trav_s_${stamp}`,
    email: stylistEmail,
    firstName: "Audit",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });

  try {
    await signInAsAdmin(page, adminEmail);

    const indexes = [
      "/admin",
      "/admin/dashboard",
      "/admin/users",
      "/admin/stylists",
      "/admin/sessions",
      "/admin/subscriptions",
      "/admin/orders",
      "/admin/promo-codes",
      "/admin/quiz-builder",
      "/admin/inspiration-photos",
      "/admin/looks",
      "/admin/audit-log",
    ];
    for (const path of indexes) {
      await gotoAndAssertOk(page, path);
    }

    // Drill into details — these are the routes that actually run server
    // components against real Postgres rows, where most render-time bugs
    // appear. The /admin/users/[id] + /admin/sessions/[id] pages are the
    // canonical pair (one per principal entity).
    await gotoAndAssertOk(page, `/admin/users/${client.id}`);
    await expect(page.locator("body")).toContainText("Audit Subject");

    await gotoAndAssertOk(page, `/admin/sessions/${session.id}`);
    await expect(page.locator("body")).toContainText(/Audit/);
    await expectNoErrorBoundary(page);
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(adminEmail);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
    void admin;
  }
});
