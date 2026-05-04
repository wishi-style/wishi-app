// E2E spec for the admin-driven stylist invitation flow.
//
// We stub `/api/admin/stylists/invite` at the network layer so the Clerk
// Invitations API isn't hit on every test run (avoids polluting the dev
// tenant with real invitations and getting rate-limited). The server-side
// Clerk integration is verified by the unit test on the metadata helper
// + manual smoke before shipping.

import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  disconnectTestDb,
  ensureAdminUser,
} from "./db";

test.afterAll(async () => {
  await disconnectTestDb();
});

async function setupAdmin(prefix: string) {
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const email = `${prefix}-admin-${ts}@e2e.wishi.test`;
  const admin = await ensureAdminUser({
    clerkId: `e2e_${prefix}_admin_${ts}`,
    email,
    firstName: "Invite",
    lastName: "Admin",
  });
  return { id: admin.id, email };
}

test.describe("Phase 13: stylist invite flow", () => {
  test("admin can open the invite dialog from /admin/stylists", async ({
    browser,
  }) => {
    const admin = await setupAdmin("invite-dialog");
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(admin.email);
      await page.getByRole("button", { name: "Sign In" }).click();
      await expect(page).not.toHaveURL(/\/sign-in/);

      await page.goto("/admin/stylists");
      await expect(page.getByRole("heading", { name: "Stylists" })).toBeVisible();

      // Both header actions render.
      await expect(
        page.getByRole("link", { name: "Invitations" }),
      ).toBeVisible();
      const inviteButton = page.getByRole("button", { name: "Invite stylist" });
      await expect(inviteButton).toBeVisible();

      await inviteButton.click();
      await expect(
        page.getByRole("heading", { name: "Invite a stylist" }),
      ).toBeVisible();

      // Default stylist type is IN_HOUSE.
      const typeTrigger = page.getByLabel("Stylist type");
      await expect(typeTrigger).toContainText(/In-house/i);
    } finally {
      await ctx.close();
      await cleanupE2EUserByEmail(admin.email);
    }
  });

  test("submitting the invite dialog hits the invite endpoint and redirects", async ({
    browser,
  }) => {
    const admin = await setupAdmin("invite-submit");
    const inviteeEmail = `invitee-${Date.now()}@example.test`;
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      // Stub the server endpoint so we don't actually call Clerk.
      let inviteCallBody: unknown = null;
      await page.route("**/api/admin/stylists/invite", async (route) => {
        inviteCallBody = JSON.parse(route.request().postData() ?? "{}");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            invitation: {
              id: "inv_e2e_stub",
              emailAddress: inviteeEmail,
              stylistType: "IN_HOUSE",
              status: "pending",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
        });
      });

      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(admin.email);
      await page.getByRole("button", { name: "Sign In" }).click();
      await expect(page).not.toHaveURL(/\/sign-in/);

      await page.goto("/admin/stylists");
      await page.getByRole("button", { name: "Invite stylist" }).click();
      await page.getByLabel("Email").fill(inviteeEmail);
      await page.getByRole("button", { name: "Send invite" }).click();

      // After successful submit, dialog closes and we land on /invites.
      await page.waitForURL(/\/admin\/stylists\/invites/);

      // Body of the API call carried the form payload.
      expect(inviteCallBody).toMatchObject({
        email: inviteeEmail,
        stylistType: "IN_HOUSE",
      });
    } finally {
      await ctx.close();
      await cleanupE2EUserByEmail(admin.email);
    }
  });

  test("invite dialog surfaces the API error when the endpoint rejects", async ({
    browser,
  }) => {
    const admin = await setupAdmin("invite-error");
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.route("**/api/admin/stylists/invite", async (route) => {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "duplicate_invitation" }),
        });
      });

      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(admin.email);
      await page.getByRole("button", { name: "Sign In" }).click();
      await expect(page).not.toHaveURL(/\/sign-in/);

      await page.goto("/admin/stylists");
      await page.getByRole("button", { name: "Invite stylist" }).click();
      await page.getByLabel("Email").fill("dupe@example.test");
      await page.getByRole("button", { name: "Send invite" }).click();

      await expect(page.getByTestId("invite-error")).toContainText(
        "duplicate_invitation",
      );
      // Dialog stays open; user can adjust + retry.
      await expect(
        page.getByRole("heading", { name: "Invite a stylist" }),
      ).toBeVisible();
    } finally {
      await ctx.close();
      await cleanupE2EUserByEmail(admin.email);
    }
  });
});
