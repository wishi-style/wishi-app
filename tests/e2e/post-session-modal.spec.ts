import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  createSessionForClient,
  disconnectTestDb,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
} from "./db";

/**
 * Loveable post-session modal — `/sessions/[id]/end-session` now renders
 * the 3-step modal (Tip → Review → Share) instead of a stacked page.
 *
 * Assertions in this spec stop at the boundary of Stripe — the tip-skipped
 * path runs end-to-end (no PaymentIntent), and rating + review writes are
 * checked via DB. Live Stripe PaymentElement coverage stays in
 * `tests/e2e/end-session.spec.ts` (which does the full Twilio + Stripe
 * Connect dance) — this spec only proves the new modal layout, the
 * step-advance behaviour, and that submit still flips Session.rating.
 */

test.afterAll(async () => {
  await disconnectTestDb();
});

async function signInAsClient(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/(stylist|sessions|onboarding|matches|welcome)/);
}

test("modal advances tip → review → share, persists rating + review on submit", async ({
  page,
}) => {
  const ts = Date.now();
  const clientEmail = `psm-c-${ts}@e2e.wishi.test`;
  const stylistEmail = `psm-s-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_psm_c_${ts}`,
    email: clientEmail,
    firstName: "Penny",
    lastName: "Modal",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_psm_s_${ts}`,
    email: stylistEmail,
    firstName: "Sage",
    lastName: "Lane",
  });
  await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "PENDING_END_APPROVAL",
    planType: "MINI",
  });

  try {
    await signInAsClient(page, clientEmail);
    await page.goto(`/sessions/${session.id}/end-session`);

    // Step 1 — tip step
    await expect(page.getByRole("heading", { name: "Loved your session?" })).toBeVisible();
    await expect(page.getByText("Sage")).toBeVisible();
    // Skip the tip — sidesteps Stripe PaymentElement so the spec doesn't
    // depend on live keys.
    await page.getByRole("button", { name: "Skip" }).click();

    // Step 2 — review step
    await expect(page.getByRole("heading", { name: "Leave Your Review" })).toBeVisible();
    await page.getByRole("button", { name: "5 stars" }).click();
    await page.getByPlaceholder("Share your experience…").fill("Great session, loved the vibe.");
    await page.getByRole("button", { name: "Submit review" }).click();

    // Step 3 — share step (no clientSecret because tip was skipped)
    await expect(page.getByRole("heading", { name: "Share Wishi With Friends" })).toBeVisible();
    const link = page.getByTestId("referral-link");
    await expect(link).toBeVisible();
    const linkText = await link.innerText();
    expect(linkText).toMatch(/\/\?ref=[A-Z0-9]+/i);

    // Verify the server actually persisted the feedback.
    const { rows } = await getPool().query(
      `SELECT rating, review_text, status FROM sessions WHERE id = $1`,
      [session.id],
    );
    expect(rows[0].rating).toBe(5);
    expect(rows[0].review_text).toBe("Great session, loved the vibe.");
    // approveEnd was already fired by the chat-card flow before the modal
    // renders, but our session was seeded as PENDING_END_APPROVAL so the
    // submit path also runs approveEnd → COMPLETED.
    expect(rows[0].status).toBe("COMPLETED");
  } finally {
    const p = getPool();
    await p.query(`DELETE FROM session_pending_actions WHERE session_id = $1`, [session.id]);
    await p.query(`DELETE FROM payouts WHERE session_id = $1`, [session.id]);
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("already-rated session shows the post-feedback page, not the modal", async ({ page }) => {
  const ts = Date.now() + 1;
  const clientEmail = `psm-rated-c-${ts}@e2e.wishi.test`;
  const stylistEmail = `psm-rated-s-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_psm_rated_c_${ts}`,
    email: clientEmail,
    firstName: "Rated",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_psm_rated_s_${ts}`,
    email: stylistEmail,
    firstName: "Rated",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "COMPLETED",
    planType: "MINI",
  });
  await getPool().query(
    `UPDATE sessions SET rating = 4, rated_at = NOW(), completed_at = NOW() WHERE id = $1`,
    [session.id],
  );

  try {
    await signInAsClient(page, clientEmail);
    await page.goto(`/sessions/${session.id}/end-session`);

    await expect(page.getByRole("heading", { name: "Thanks for the feedback" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to sessions" })).toBeVisible();
    // Modal should NOT render in the already-rated branch.
    await expect(page.getByRole("heading", { name: "Loved your session?" })).toHaveCount(0);
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
