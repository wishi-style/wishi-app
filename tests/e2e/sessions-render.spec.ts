import { expect, test } from "@playwright/test";
import {
  ensureClientUser,
  ensureStylistUser,
  createSessionForClient,
  cleanupStylistProfile,
  cleanupE2EUserByEmail,
  getPool,
} from "./db";
import { installFailureGuards, expectNoErrorBoundary } from "./fixtures/traversal";

/**
 * /sessions render — regression cover for the staging "Try again" report
 * Matt hit while clicking the "My Style Sessions" navbar link.
 *
 * The original empty-state /sessions render is already exercised by the
 * authed-client navbar traversal. What that test misses is the case
 * where the user has at least one session AND the linked stylist has an
 * avatarUrl whose hostname isn't in `next.config.ts#images.remotePatterns`
 * — Next 16's Image component throws at render time for any unconfigured
 * remote host, which bubbles to (client)/error.tsx ("This didn't load /
 * Try again").
 *
 * Production users sign up via Clerk, which seeds avatarUrl from
 * `img.clerk.com` or similar — none of which are whitelisted on main —
 * so anyone with a session in their list trips this on staging.
 */

test("authed client with a Clerk-hosted avatar url on a session's stylist renders /sessions cleanly", async ({
  page,
}) => {
  installFailureGuards(page);

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clientEmail = `sess-render-c-${stamp}@e2e.wishi.test`;
  const stylistEmail = `sess-render-s-${stamp}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_sess_render_c_${stamp}`,
    email: clientEmail,
    firstName: "List",
    lastName: "Viewer",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_sess_render_s_${stamp}`,
    email: stylistEmail,
    firstName: "Avatar",
    lastName: "Holder",
  });

  // Stamp a Clerk-style avatar url on the stylist user — this is what
  // the Clerk webhook actually writes to the User row in production.
  await getPool().query(
    `UPDATE users SET avatar_url = $1 WHERE id = $2`,
    ["https://img.clerk.com/eyJ0eXBlIjoicHJveHkifQ", stylist.id],
  );

  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });

  try {
    // Sign in as the client.
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(clientEmail);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).not.toHaveURL(/\/sign-in/);

    // Navigate directly to /sessions and capture the document response
    // status so failures point at HTTP-level breakage even when Next dev
    // tools render an inline error overlay over a 200 chrome.
    const docResp = await page.goto("/sessions");
    await page.waitForLoadState("networkidle");

    expect(
      docResp?.status() ?? 0,
      `/sessions returned ${docResp?.status()} for an authed user with a Clerk-style stylist avatar`,
    ).toBeLessThan(500);

    await expect(page).toHaveURL(/\/sessions(\/|\?|$)/);
    await expectNoErrorBoundary(page);

    // The seeded session row renders, with the stylist's name resolved.
    await expect(page.getByText(/Avatar Holder/i)).toBeVisible();
    // Plan label renders for the seeded MAJOR session.
    await expect(page.getByText(/MAJOR Session/i).first()).toBeVisible();
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
    void session;
  }
});
