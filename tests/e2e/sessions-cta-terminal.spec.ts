import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  createBoardFixture,
  createSessionForClient,
  disconnectTestDb,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
} from "./db";

/**
 * Terminal-status SessionCard contract:
 *
 *  - COMPLETED / CANCELLED / FROZEN / REASSIGNED all show a single
 *    "Rebook {firstName}" CTA pointing at the stylist's public profile.
 *  - The status blurb is neutral ("Session completed/cancelled/...") and
 *    ignores any lingering chat-message excerpt.
 *  - An unrated board on a CANCELLED session MUST NOT trigger
 *    "Review Moodboard" / "Review Styleboard" — chats are closed by then.
 */

test.afterAll(async () => {
  await disconnectTestDb();
});

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

test("cancelled session with unrated moodboard → Rebook only, no Review", async ({
  page,
}) => {
  const ts = Date.now();
  const clientEmail = `term-c-${ts}@e2e.wishi.test`;
  const stylistEmail = `term-s-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_term_c_${ts}`,
    email: clientEmail,
    firstName: "Term",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_term_s_${ts}`,
    email: stylistEmail,
    firstName: "Maya",
    lastName: "Brooks",
  });
  const stylistProfile = await ensureStylistProfile({ userId: stylist.id });

  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "CANCELLED",
    planType: "MAJOR",
  });
  // Unrated moodboard sitting on the cancelled session — this is the
  // condition that used to flip the card into "Review Moodboard".
  await createBoardFixture({
    sessionId: session.id,
    type: "MOODBOARD",
    sentMinutesAgo: 120,
  });

  try {
    await signIn(page, clientEmail);
    await page.goto("/sessions");
    await page.waitForLoadState("networkidle");

    // The Rebook CTA exists and points at the stylist profile.
    const rebook = page.getByRole("link", { name: "Rebook Maya" });
    await expect(rebook).toBeVisible();
    expect(await rebook.getAttribute("href")).toBe(
      `/stylists/${stylistProfile.id}`,
    );

    // The Review-* CTAs do NOT.
    await expect(
      page.getByRole("link", {
        name: /Review (Moodboard|Styleboard|Revised Look)/,
      }),
    ).toHaveCount(0);
    // "View Details" is also gone.
    await expect(page.getByRole("link", { name: "View Details" })).toHaveCount(0);

    // Neutral blurb is present.
    const body = await page.locator("body").innerText();
    expect(body).toContain("Session cancelled.");
  } finally {
    await getPool().query(`DELETE FROM boards WHERE session_id = $1`, [
      session.id,
    ]);
    await getPool().query(
      `DELETE FROM session_pending_actions WHERE session_id = $1`,
      [session.id],
    );
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("frozen session falls back to /stylists when no stylist profile", async ({
  page,
}) => {
  const ts = Date.now() + 1;
  const clientEmail = `term-fb-${ts}@e2e.wishi.test`;
  const stylistEmail = `term-fb-s-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_term_fb_c_${ts}`,
    email: clientEmail,
    firstName: "Frozen",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_term_fb_s_${ts}`,
    email: stylistEmail,
    firstName: "Iris",
    lastName: "Park",
  });
  // No StylistProfile row — simulates a reassigned-away or never-onboarded
  // stylist on the session record.

  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "FROZEN",
    planType: "MINI",
  });

  try {
    await signIn(page, clientEmail);
    await page.goto("/sessions");
    await page.waitForLoadState("networkidle");

    const rebook = page.getByRole("link", { name: "Rebook Iris" });
    await expect(rebook).toBeVisible();
    expect(await rebook.getAttribute("href")).toBe("/stylists");

    const body = await page.locator("body").innerText();
    expect(body).toContain("Session frozen.");
  } finally {
    await getPool().query(
      `DELETE FROM session_pending_actions WHERE session_id = $1`,
      [session.id],
    );
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
