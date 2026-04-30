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

test("§3.6 — Items toolbar: grid-size toggle + Select mode + count", async ({
  page,
}) => {
  const ts = Date.now();
  const email = `p2-profile-tb-${ts}@e2e.wishi.test`;
  await ensureClientUser({
    clerkId: `e2e_p2_profile_tb_${ts}`,
    email,
    firstName: "Toolbar",
    lastName: "Tester",
  });
  try {
    await signInAsClient(page, email);
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");

    // Loveable Profile.tsx:574-580 — left grid-size button.
    const gridButton = page.getByRole("button", {
      name: /Switch to (compact|normal) grid/,
    });
    await expect(gridButton).toBeVisible();

    // Right side count + Select. With zero closet items the label reads "0 Items".
    await expect(page.getByText(/^\s*0\s+Items\s*$/i)).toBeVisible();
    const selectBtn = page.getByRole("button", { name: "Select", exact: true });
    await expect(selectBtn).toBeVisible();

    // Entering select mode swaps Select → Cancel.
    await selectBtn.click();
    await expect(
      page.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Select", exact: true }),
    ).toHaveCount(0);
  } finally {
    await cleanupE2EUserByEmail(email);
  }
});

test("§3.6 — Looks tab uses pill sub-tabs (Style boards / Favorites)", async ({
  page,
}) => {
  const ts = Date.now();
  const email = `p2-profile-looks-${ts}@e2e.wishi.test`;
  await ensureClientUser({
    clerkId: `e2e_p2_profile_looks_${ts}`,
    email,
    firstName: "Looks",
    lastName: "Tester",
  });
  try {
    await signInAsClient(page, email);
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");

    await page.getByRole("tab", { name: "Looks" }).click();

    // Loveable Profile.tsx:1042-1064 — pill buttons, not underline tabs.
    const styleboardsBtn = page.getByRole("button", {
      name: "Style boards",
      exact: true,
    });
    const favoritesBtn = page.getByRole("button", {
      name: "Favorites",
      exact: true,
    });
    await expect(styleboardsBtn).toBeVisible();
    await expect(favoritesBtn).toBeVisible();

    // Active pill: bg-foreground / text-background classes (Tailwind v4).
    await expect(styleboardsBtn).toHaveClass(/bg-foreground/);
    await expect(favoritesBtn).not.toHaveClass(/bg-foreground/);

    await favoritesBtn.click();
    await expect(favoritesBtn).toHaveClass(/bg-foreground/);
    await expect(styleboardsBtn).not.toHaveClass(/bg-foreground/);
  } finally {
    await cleanupE2EUserByEmail(email);
  }
});

test("guests on /onboarding redirect to /match-quiz (Loveable parity)", async ({
  request,
}) => {
  const res = await request.get("/onboarding", { maxRedirects: 0 });
  expect([302, 307]).toContain(res.status());
  expect(res.headers()["location"]).toMatch(/\/match-quiz/);
});
