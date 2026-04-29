import { expect, test, type Page } from "@playwright/test";
import {
  ensureClientUser,
  ensureStylistUser,
  ensureStylistProfile,
  cleanupStylistProfile,
  cleanupE2EUserByEmail,
  createSessionForClient,
  getPool,
} from "./db";

/**
 * Funnel port (PR #79) coverage. Each surface introduced or moved by the
 * Loveable funnel rewrite gets a Playwright check here so the contract
 * doesn't silently regress:
 *
 *   /                                         (CTAs route to /match-quiz)
 *   /welcome                                  → 308 redirect to /match-quiz
 *   /match-quiz (authed walkthrough)          → /stylist-match
 *   /stylist-match (auth gate + render)
 *   /select-plan (auth gate + render)
 *   /stylists/[id] Continue (signed-in href)
 *   /stylists/[id] Continue (guest is a button, not a link)
 *   /sessions/[id]/chat first-entry style-quiz gate
 *
 * The /select-plan and /stylists/[id] signed-in href cases are already
 * exercised by `authed-client-traversal.spec.ts`; this file fills the
 * gaps that one doesn't cover.
 */

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(
    /\/(sessions|stylist|match-quiz|matches|stylist-match|welcome|select-plan)/,
  );
}

test("/welcome 308 redirects to /match-quiz", async ({ page }) => {
  const response = await page.goto("/welcome");
  // Final landing URL is /match-quiz (Playwright follows redirects).
  await expect(page).toHaveURL(/\/match-quiz$/);
  // Page rendered the new 4-step UI, not the deleted /welcome shell.
  await expect(
    page.getByRole("heading", {
      name: /Let.s find your perfect style match/i,
    }),
  ).toBeVisible();
  // Status check is on the FINAL response, but Playwright surfaces it.
  expect(response?.ok()).toBeTruthy();
});

test("/match-quiz authed walkthrough lands on /stylist-match", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clientEmail = `funnel-mq-${stamp}@e2e.wishi.test`;
  const stylistEmail = `funnel-mq-styl-${stamp}@e2e.wishi.test`;

  await ensureClientUser({
    clerkId: `e2e_funnel_mq_${stamp}`,
    email: clientEmail,
    firstName: "Funnel",
    lastName: "Walker",
  });
  // Seed an eligible stylist so /stylist-match has at least one match —
  // matching on style overlap with the "Minimal" style we'll vote LOVE IT for.
  const stylist = await ensureStylistUser({
    clerkId: `e2e_funnel_mq_styl_${stamp}`,
    email: stylistEmail,
    firstName: "Match",
    lastName: "Stylist",
  });
  const profile = await ensureStylistProfile({
    userId: stylist.id,
    matchEligible: true,
    isAvailable: true,
    genderPreference: ["FEMALE"],
    styleSpecialties: ["Minimal"],
  });

  try {
    await signIn(page, clientEmail);
    await page.goto("/match-quiz");

    // Step 0 — NEEDS: pick one chip and continue.
    await page.getByRole("button", { name: "Elevated Everyday" }).click();
    await page.getByRole("button", { name: /^Continue$/ }).click();

    // Step 1 — DEPARTMENT: clicking advances automatically. Loveable's
    // pill button has accessible name "Women" (text content, no aria-label).
    await page.getByRole("button", { name: "Women", exact: true }).click();

    // Step 2 — BODY TYPE: pick one and continue.
    await page.getByRole("button", { name: "Average", exact: true }).click();
    await page.getByRole("button", { name: /^Continue$/ }).click();

    // Step 3 — STYLE: vote LOVE IT for "Minimal" (so the seeded stylist
    // matches on style overlap), then NO for the rest. Each vote auto-
    // advances after a 500ms animation; the final vote calls
    // submitMatchQuiz and pushes to /stylist-match.
    const styles = [
      "Minimal",
      "Feminine",
      "Chic",
      "Classic",
      "Bohemian",
      "Street",
      "Sexy",
    ];
    for (let i = 0; i < styles.length; i += 1) {
      const vote = i === 0 ? "LOVE IT" : "NO";
      await page
        .getByRole("button", { name: new RegExp(`^${vote} for ${styles[i]}$`) })
        .click();
      // Inter-step animation timer; small budget keeps the test responsive.
      await page.waitForTimeout(700);
    }

    await expect(page).toHaveURL(/\/stylist-match$/);
    await expect(
      page.getByRole("heading", { name: /We Found Your/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Perfect Match/i }),
    ).toBeVisible();
    // Continue CTA carries the matched stylist's profile id forward.
    await expect(
      page.getByRole("link", { name: /^Continue with /i }),
    ).toHaveAttribute(
      "href",
      new RegExp(`^/select-plan\\?stylistId=${profile.id}$`),
    );
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("/stylist-match guest is bounced to /match-quiz", async ({ page }) => {
  await page.goto("/stylist-match");
  await expect(page).toHaveURL(/\/match-quiz$/);
});

test("/stylists/[id] Continue is a <button> for guests (no href, opens Clerk modal client-side)", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const stylistEmail = `funnel-prof-styl-${stamp}@e2e.wishi.test`;
  const stylist = await ensureStylistUser({
    clerkId: `e2e_funnel_prof_${stamp}`,
    email: stylistEmail,
    firstName: "Profile",
    lastName: "Stylist",
  });
  const profile = await ensureStylistProfile({
    userId: stylist.id,
    matchEligible: true,
    isAvailable: true,
  });

  try {
    await page.goto(`/stylists/${profile.id}`);
    // Two CTAs render (hero + sticky footer); both must be <button>s with
    // no href attribute when the visitor is unauthed. A regression here
    // would route guests through a Link to /select-plan, skipping the
    // Clerk sign-up modal we want them to hit first.
    const ctas = page.getByRole("button", { name: /^Continue with Profile$/ });
    await expect(ctas.first()).toBeVisible();
    expect(await ctas.count()).toBeGreaterThanOrEqual(1);
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("/sessions/[id]/chat redirects to /sessions/[id]/style-quiz when StyleProfile is missing", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clientEmail = `funnel-chat-${stamp}@e2e.wishi.test`;
  const stylistEmail = `funnel-chat-styl-${stamp}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_funnel_chat_${stamp}`,
    email: clientEmail,
    firstName: "Chat",
    lastName: "Walker",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_funnel_chat_styl_${stamp}`,
    email: stylistEmail,
    firstName: "Chat",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });

  // Active session with a Twilio channel set so the chat page passes its
  // status + channel guards and reaches the style-quiz gate.
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
  });
  await getPool().query(
    `UPDATE sessions SET twilio_channel_sid = $1 WHERE id = $2`,
    [`CH${stamp}`, session.id],
  );

  try {
    await signIn(page, clientEmail);
    await page.goto(`/sessions/${session.id}/chat`);
    await expect(page).toHaveURL(
      new RegExp(`/sessions/${session.id}/style-quiz`),
    );
  } finally {
    await getPool().query(`DELETE FROM sessions WHERE id = $1`, [session.id]);
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("/sessions/[id]/chat does NOT redirect when StyleProfile.quizCompletedAt is set", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clientEmail = `funnel-chat-ok-${stamp}@e2e.wishi.test`;
  const stylistEmail = `funnel-chat-ok-styl-${stamp}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_funnel_chat_ok_${stamp}`,
    email: clientEmail,
    firstName: "Chat",
    lastName: "OK",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_funnel_chat_ok_styl_${stamp}`,
    email: stylistEmail,
    firstName: "Stylist",
    lastName: "OK",
  });
  await ensureStylistProfile({ userId: stylist.id });

  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
  });
  await getPool().query(
    `UPDATE sessions SET twilio_channel_sid = $1 WHERE id = $2`,
    [`CHok${stamp}`, session.id],
  );
  // Mark the style quiz as complete — the chat page should let the user in.
  await getPool().query(
    `INSERT INTO style_profiles (id, user_id, quiz_completed_at, quiz_answers, created_at, updated_at)
     VALUES ($1, $2, NOW(), '{}'::jsonb, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET quiz_completed_at = NOW()`,
    [`sp_${stamp}`, client.id],
  );

  try {
    await signIn(page, clientEmail);
    await page.goto(`/sessions/${session.id}/chat`);
    // Stay on /chat, no /style-quiz redirect.
    await expect(page).toHaveURL(new RegExp(`/sessions/${session.id}/chat$`));
  } finally {
    await getPool().query(`DELETE FROM sessions WHERE id = $1`, [session.id]);
    await getPool().query(`DELETE FROM style_profiles WHERE user_id = $1`, [
      client.id,
    ]);
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
