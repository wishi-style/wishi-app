import { expect, test, type Page } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  disconnectTestDb,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
} from "./db";

/**
 * Regression coverage for the cross-role redirect contract that
 * `requireRole` and `/post-signin` enforce. Both used to short-circuit
 * to `forbidden()` (or to a `redirect_url` that pointed somewhere the
 * user's role couldn't reach), surfacing the dead-end "Access denied"
 * page that triggered the original investigation.
 *
 * Contract under test:
 *   - STYLIST hitting /sessions (a CLIENT-only surface) → /stylist/dashboard
 *   - CLIENT hitting /stylist/dashboard → /
 *   - /post-signin?redirect_url=<role-mismatched path> → role default,
 *     not the mismatched path
 *   - /post-signin?redirect_url=<role-matched path> → that path (the
 *     deep-link contract still works for its intended cases)
 */

test.afterAll(async () => {
  await disconnectTestDb();
});

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in?e2e=1");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(
    /\/(stylist|sessions|stylists|matches|post-signin|$)/,
  );
}

test("STYLIST visiting /sessions redirects to /stylist/dashboard (not 403)", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const email = `xrole-styl-${stamp}@e2e.wishi.test`;

  const stylist = await ensureStylistUser({
    clerkId: `e2e_xrole_styl_${stamp}`,
    email,
    firstName: "Cross",
    lastName: "Role",
  });
  await ensureStylistProfile({ userId: stylist.id });

  try {
    await signIn(page, email);
    // Direct hit on a CLIENT-only surface. Pre-fix this 403'd because the
    // (client) layout's requireRole called forbidden() when it saw a
    // non-CLIENT role. Now it redirects to the role's home.
    const response = await page.goto("/sessions");
    await expect(page).toHaveURL(/\/stylist\/dashboard/);
    expect(response?.ok()).toBeTruthy();
    // Sanity: the dead-end "Access denied" page must not have rendered
    // anywhere in the chain.
    await expect(page.getByText(/Access denied/i)).toHaveCount(0);
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(email);
  }
});

test("CLIENT visiting /stylist/dashboard redirects to / (not 403)", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const email = `xrole-client-${stamp}@e2e.wishi.test`;

  await ensureClientUser({
    clerkId: `e2e_xrole_client_${stamp}`,
    email,
    firstName: "Cross",
    lastName: "Client",
  });

  try {
    await signIn(page, email);
    await page.goto("/stylist/dashboard");
    // CLIENTs get sent home. The exact home is "/" (smart-spark-craft);
    // we anchor the regex with $ to confirm the final landing isn't a
    // sub-route of /.
    await expect(page).toHaveURL(/^[^?#]*\/$/);
    await expect(page.getByText(/Access denied/i)).toHaveCount(0);
  } finally {
    await cleanupE2EUserByEmail(email);
  }
});

test("post-signin: STYLIST + redirect_url=/sessions → /stylist/dashboard", async ({
  page,
}) => {
  // The original failure pattern: a STYLIST clicks a Continue CTA on
  // /stylists/[id] that opens the Clerk modal with redirect_url pointing at
  // /select-plan (a CLIENT surface). Pre-fix, /post-signin honored the
  // redirect_url unconditionally and bounced the stylist into a flow that
  // would 403 / redirect downstream. Now we ignore the deep link when it
  // doesn't fit the resolved role.
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const email = `xrole-ps-styl-${stamp}@e2e.wishi.test`;

  const stylist = await ensureStylistUser({
    clerkId: `e2e_xrole_ps_styl_${stamp}`,
    email,
    firstName: "PS",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });

  try {
    await signIn(page, email);
    await page.goto("/post-signin?redirect_url=/sessions");
    await expect(page).toHaveURL(/\/stylist\/dashboard/);
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(email);
  }
});

test("post-signin: CLIENT + redirect_url=/stylist/dashboard → /", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const email = `xrole-ps-client-${stamp}@e2e.wishi.test`;

  await ensureClientUser({
    clerkId: `e2e_xrole_ps_client_${stamp}`,
    email,
    firstName: "PS",
    lastName: "Client",
  });

  try {
    await signIn(page, email);
    await page.goto("/post-signin?redirect_url=/stylist/dashboard");
    await expect(page).toHaveURL(/^[^?#]*\/$/);
  } finally {
    await cleanupE2EUserByEmail(email);
  }
});

test("post-signin: CLIENT + redirect_url=/sessions still honors the deep link", async ({
  page,
}) => {
  // The intended-use case still works — gating only kicks in when the role
  // and the path don't match.
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const email = `xrole-ps-deep-${stamp}@e2e.wishi.test`;

  await ensureClientUser({
    clerkId: `e2e_xrole_ps_deep_${stamp}`,
    email,
    firstName: "Deep",
    lastName: "Link",
  });

  try {
    await signIn(page, email);
    await page.goto("/post-signin?redirect_url=/sessions");
    await expect(page).toHaveURL(/\/sessions/);
  } finally {
    await cleanupE2EUserByEmail(email);
  }
});
