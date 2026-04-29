import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  disconnectTestDb,
  ensureClientUser,
} from "./db";

/**
 * §3.6 verifications: /closet collapses to /profile (Loveable's unified
 * profile screen). Header surfaces the user's first name + loyalty tier;
 * Items / Looks / Collections tabs ride underneath.
 *
 * Runs against `npm run dev:e2e` (port 3001, E2E_AUTH_MODE=true).
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

test("§3.6 — /closet permanent-redirects to /profile", async ({ page }) => {
  const ts = Date.now();
  const email = `p2-profile-rd-${ts}@e2e.wishi.test`;
  await ensureClientUser({
    clerkId: `e2e_p2_profile_rd_${ts}`,
    email,
    firstName: "Redirect",
    lastName: "Tester",
  });
  try {
    await signInAsClient(page, email);
    const res = await page.request.get("/closet", { maxRedirects: 0 });
    // Next.js permanent redirects use 308.
    expect([301, 308]).toContain(res.status());
    expect(res.headers()["location"]).toContain("/profile");
  } finally {
    await cleanupE2EUserByEmail(email);
  }
});

test("§3.6 — /profile renders Loveable header with firstName + loyalty tier + 3 tabs", async ({
  page,
}) => {
  const ts = Date.now();
  const email = `p2-profile-hdr-${ts}@e2e.wishi.test`;
  await ensureClientUser({
    clerkId: `e2e_p2_profile_hdr_${ts}`,
    email,
    firstName: "Sienna",
    lastName: "Cardozo",
  });
  try {
    await signInAsClient(page, email);
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");

    // Loveable header: avatar + "{firstName}'s Closet" + loyalty tier badge.
    await expect(
      page.getByRole("heading", { name: "Sienna's Closet" }),
    ).toBeVisible();
    // BRONZE is the default tier for a freshly seeded user.
    await expect(page.getByText(/Bronze Member/i)).toBeVisible();

    // The three tabs render in the same Items / Looks / Collections order
    // Loveable ships.
    await expect(page.getByRole("tab", { name: "Items" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Looks" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Collections" })).toBeVisible();
  } finally {
    await cleanupE2EUserByEmail(email);
  }
});
