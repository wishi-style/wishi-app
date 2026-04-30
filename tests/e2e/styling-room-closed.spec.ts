import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  createSessionForClient,
  disconnectTestDb,
  ensureClientUser,
  ensureStylistUser,
  getPool,
} from "./db";

/**
 * Loveable's StylingRoom renders a closed-state CTA row on COMPLETED /
 * CANCELLED / REASSIGNED sessions: "This session has ended." with a
 * Session Recap button (links into the post-session flow) + Book a new
 * session link. This spec verifies both surfaces render and the recap
 * button targets /sessions/[id]/end-session.
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

test("closed session renders Session Recap button + Book a new session link in StylingRoom", async ({
  page,
}) => {
  const ts = Date.now();
  const clientEmail = `closed-recap-c-${ts}@e2e.wishi.test`;
  const stylistEmail = `closed-recap-s-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_closed_recap_c_${ts}`,
    email: clientEmail,
    firstName: "Recap",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_closed_recap_s_${ts}`,
    email: stylistEmail,
    firstName: "Stella",
    lastName: "Stylist",
  });

  // A COMPLETED session must already have a Twilio channel sid (the chat page
  // redirects without one), and a StyleProfile (the page short-circuits to
  // /style-quiz otherwise). Seed both so the workspace actually renders.
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "COMPLETED",
    planType: "MINI",
  });

  const pool = getPool();
  await pool.query(
    `UPDATE sessions SET twilio_channel_sid = $1 WHERE id = $2`,
    [`CH_e2e_${ts}`, session.id],
  );
  await pool.query(
    `INSERT INTO style_profiles
       (id, user_id, style_preferences, style_icons, quiz_completed_at, created_at, updated_at)
     VALUES ($1, $2, '{}', '{}', NOW(), NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET quiz_completed_at = EXCLUDED.quiz_completed_at`,
    [`sp_e2e_${ts}`, client.id],
  );

  try {
    await signInAsClient(page, clientEmail);
    await page.goto(`/sessions/${session.id}/chat`);
    await page.waitForLoadState("networkidle");

    // The closed-state row replaces the composer.
    await expect(page.getByText("This session has ended.")).toBeVisible();
    const recap = page.getByRole("link", {
      name: "Session Recap",
      exact: true,
    });
    await expect(recap).toBeVisible();
    await expect(recap).toHaveAttribute(
      "href",
      `/sessions/${session.id}/end-session`,
    );
    await expect(
      page.getByRole("link", { name: "Book a new session", exact: true }),
    ).toBeVisible();
  } finally {
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
