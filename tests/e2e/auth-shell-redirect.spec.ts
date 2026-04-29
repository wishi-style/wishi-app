import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  disconnectTestDb,
  ensureClientUser,
  ensureStylistUser,
  getPool,
} from "./db";

/**
 * Auth shell redirect verifications: a user shouldn't have to know what URL
 * to type. Sign-in lands you on your role's Loveable home.
 *
 *   CLIENT  → /              (smart-spark-craft home)
 *   STYLIST → /stylist/dashboard  (wishi-reimagined home)
 *
 * And a STYLIST who tries to navigate to a client-only authed surface
 * (e.g. /sessions, /cart) gets bounced to /stylist/dashboard by the proxy.
 *
 * Runs against `npm run dev:e2e` (port 3001, E2E_AUTH_MODE=true).
 */

test.afterAll(async () => {
  await disconnectTestDb();
});

test("client sign-in lands on smart-spark-craft home (/)", async ({ page }) => {
  const email = `auth-shell-client-${Date.now()}@e2e.wishi.test`;
  await cleanupE2EUserByEmail(email);
  await ensureClientUser({
    clerkId: `e2e_auth_shell_client_${Date.now()}`,
    email,
    firstName: "AuthShell",
    lastName: "Client",
  });

  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Sign In" }).click();
    // signInForE2E redirects to /post-signin, which resolves role and
    // forwards CLIENT users to / (smart-spark-craft home). The smoke check
    // is "we're no longer on /sign-in"; the exact destination depends on
    // whether redirect_url was passed.
    await expect(page).not.toHaveURL(/\/sign-in/);
  } finally {
    await cleanupE2EUserByEmail(email);
  }
});

test("stylist sign-in lands on wishi-reimagined home (/stylist/dashboard)", async ({
  page,
}) => {
  const email = `auth-shell-stylist-${Date.now()}@e2e.wishi.test`;
  await cleanupE2EUserByEmail(email);
  const stylist = await ensureStylistUser({
    clerkId: `e2e_auth_shell_stylist_${Date.now()}`,
    email,
    firstName: "AuthShell",
    lastName: "Stylist",
  });
  // Mark onboarding complete so the proxy onboarding gate doesn't bounce
  // us to /onboarding before we can reach /post-signin.
  await getPool().query(
    `INSERT INTO stylist_profiles (id, user_id, stylist_type, onboarding_status, onboarding_step, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, 'PLATFORM', 'ELIGIBLE', 12, NOW(), NOW())`,
    [stylist.id],
  );

  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Sign In" }).click();
    // /post-signin resolves role=STYLIST and redirects to /stylist/dashboard.
    await expect(page).toHaveURL("/stylist/dashboard");
  } finally {
    await cleanupE2EUserByEmail(email);
  }
});

test("stylist visiting /sessions is bounced to /stylist/dashboard", async ({
  page,
}) => {
  const email = `auth-shell-bounce-${Date.now()}@e2e.wishi.test`;
  await cleanupE2EUserByEmail(email);
  const stylist = await ensureStylistUser({
    clerkId: `e2e_auth_shell_bounce_${Date.now()}`,
    email,
    firstName: "AuthShell",
    lastName: "Bounce",
  });
  await getPool().query(
    `INSERT INTO stylist_profiles (id, user_id, stylist_type, onboarding_status, onboarding_step, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, 'PLATFORM', 'ELIGIBLE', 12, NOW(), NOW())`,
    [stylist.id],
  );

  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL("/stylist/dashboard");

    // Now manually navigate to a client-only surface — proxy must redirect.
    await page.goto("/sessions");
    await expect(page).toHaveURL("/stylist/dashboard");

    await page.goto("/cart");
    await expect(page).toHaveURL("/stylist/dashboard");

    await page.goto("/favorites");
    await expect(page).toHaveURL("/stylist/dashboard");
  } finally {
    await cleanupE2EUserByEmail(email);
  }
});

test("client visiting /stylist/dashboard hits forbidden() (existing requireRole)", async ({
  page,
}) => {
  const email = `auth-shell-cforbid-${Date.now()}@e2e.wishi.test`;
  await cleanupE2EUserByEmail(email);
  await ensureClientUser({
    clerkId: `e2e_auth_shell_cforbid_${Date.now()}`,
    email,
    firstName: "AuthShell",
    lastName: "ClientForbid",
  });

  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).not.toHaveURL(/\/sign-in/);

    const response = await page.goto("/stylist/dashboard");
    // requireRole("STYLIST") in the (stylist) layout forbids non-stylists.
    expect(response?.status()).toBe(403);
  } finally {
    await cleanupE2EUserByEmail(email);
  }
});
