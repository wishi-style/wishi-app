import { expect, test, type Page } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  createSessionForClient,
  disconnectTestDb,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
  getStyleProfileByUserId,
} from "./db";

/**
 * E2E coverage for the Loveable-port `/style-quiz`. The route is now a
 * verbatim port of `smart-spark-craft/src/pages/StyleQuiz.tsx` (26 steps,
 * only steps 0 + 1 required) backed by `submitStyleQuiz` server action.
 *
 * Invariants this file pins:
 *  1. Session-scoped final CTA reads "Continue to my session" (not the
 *     standalone "Finish style quiz").
 *  2. A user who answers only the 2 required steps (0: shopping reason,
 *     1: pieces) and skips everything else can still submit successfully
 *     and lands in chat with `StyleProfile.quizCompletedAt` set.
 *  3. The page does NOT redirect-loop when a `StyleProfile` row exists with
 *     `quizCompletedAt = null` — the page-level gate and the action gate
 *     both key on `quizCompletedAt`, not row existence.
 */

test.afterAll(async () => {
  await disconnectTestDb();
});

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in?e2e=1");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/(sessions|stylists|matches|post-signin|$)/);
}

// Loveable's required Step 0 → Step 1 minimum: pick a shopping reason
// (the "A holiday" pick has no conditional sub-question, so it auto-
// advances) and pick at least one piece.
async function answerRequiredSteps(page: Page): Promise<void> {
  await page.getByRole("button", { name: "A holiday" }).click();
  // Step 0 auto-advances on selection for non-workwear reasons.
  await expect(page.getByText("What pieces are you looking for?")).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: "Tops", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
}

// Walk from step 2 → step 25 by tapping Skip on every screen that has one,
// otherwise Next (default-valued screens like step 16 Birthday).
async function skipToEnd(page: Page): Promise<void> {
  // 23 optional steps follow.
  for (let i = 0; i < 23; i += 1) {
    const skipBtn = page.getByRole("button", { name: "Skip", exact: true });
    if (await skipBtn.isVisible().catch(() => false)) {
      await skipBtn.click();
      continue;
    }
    await page.getByRole("button", { name: "Next", exact: true }).click();
  }
}

test('session-scoped style-quiz final CTA reads "Continue to my session"', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const email = `sq-cta-${stamp}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_sq_cta_${stamp}`,
    email,
    firstName: "Quiz",
    lastName: "CTA",
  });
  const session = await createSessionForClient({ clientId: client.id });

  try {
    await signIn(page, email);
    await page.goto(`/sessions/${session.id}/style-quiz`);
    await answerRequiredSteps(page);
    await skipToEnd(page);
    await expect(
      page.getByRole("button", { name: "Continue to my session" }),
    ).toBeVisible();
    // Loveable's standalone label must not leak into the session context.
    await expect(
      page.getByRole("button", { name: "Finish style quiz" }),
    ).toHaveCount(0);
  } finally {
    await getPool().query(`DELETE FROM sessions WHERE id = $1`, [session.id]);
    await cleanupE2EUserByEmail(email);
  }
});

test("style-quiz submit succeeds when the user skips every optional step", async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clientEmail = `sq-skipall-${stamp}@e2e.wishi.test`;
  const stylistEmail = `sq-skipall-styl-${stamp}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_sq_skipall_${stamp}`,
    email: clientEmail,
    firstName: "Skip",
    lastName: "All",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_sq_skipall_styl_${stamp}`,
    email: stylistEmail,
    firstName: "Stylist",
    lastName: "Skip",
  });
  await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
  });

  try {
    await signIn(page, clientEmail);
    await page.goto(`/sessions/${session.id}/style-quiz`);
    await answerRequiredSteps(page);
    await skipToEnd(page);
    await page.getByRole("button", { name: "Continue to my session" }).click();

    await expect(page).toHaveURL(
      new RegExp(`/sessions/${session.id}(?:/chat)?$`),
      { timeout: 10_000 },
    );
    await expect(page.getByText(/Server Components render/i)).toHaveCount(0);

    const sp = await getStyleProfileByUserId(client.id);
    expect(sp?.quiz_completed_at).not.toBeNull();
    expect(sp?.shopping_reason).toBe("HOLIDAY");
    expect(sp?.pieces_needed).toContain("Tops");
  } finally {
    await getPool().query(`DELETE FROM sessions WHERE id = $1`, [session.id]);
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("style-quiz does not redirect-loop when StyleProfile exists with quizCompletedAt=null", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clientEmail = `sq-loop-${stamp}@e2e.wishi.test`;
  const stylistEmail = `sq-loop-styl-${stamp}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_sq_loop_${stamp}`,
    email: clientEmail,
    firstName: "Loop",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_sq_loop_styl_${stamp}`,
    email: stylistEmail,
    firstName: "Stylist",
    lastName: "Loop",
  });
  await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
  });

  // Simulates a user who advanced past step 1 (which upserts the row) but
  // bailed without submitting — prior bug had the gate matching row
  // existence and redirect-looping back to /chat.
  await getPool().query(
    `INSERT INTO style_profiles (id, user_id, style_preferences, style_icons, pieces_needed, preferred_brands, avoid_brands, occasions, shopping_values, quiz_answers, created_at, updated_at)
     VALUES ($1, $2, $3, $3, $3, $3, $3, $3, $3, '{}'::jsonb, NOW(), NOW())`,
    [`sp_loop_${stamp}`, client.id, []],
  );

  try {
    await signIn(page, clientEmail);
    await page.goto(`/sessions/${session.id}/style-quiz`);

    // Page renders the quiz, not a redirect.
    await expect(page.getByText("What are you shopping for?")).toBeVisible();

    await answerRequiredSteps(page);
    await skipToEnd(page);
    await page.getByRole("button", { name: "Continue to my session" }).click();

    await expect(page).toHaveURL(
      new RegExp(`/sessions/${session.id}(?:/chat)?$`),
      { timeout: 10_000 },
    );
    const sp = await getStyleProfileByUserId(client.id);
    expect(sp?.quiz_completed_at).not.toBeNull();
  } finally {
    await getPool().query(`DELETE FROM sessions WHERE id = $1`, [session.id]);
    await getPool().query(`DELETE FROM style_profiles WHERE user_id = $1`, [client.id]);
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test('standalone /style-quiz final CTA reads "Finish style quiz"', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const email = `sq-standalone-${stamp}@e2e.wishi.test`;

  await ensureClientUser({
    clerkId: `e2e_sq_standalone_${stamp}`,
    email,
    firstName: "Standalone",
    lastName: "Quiz",
  });

  try {
    await signIn(page, email);
    await page.goto("/style-quiz");
    await answerRequiredSteps(page);
    await skipToEnd(page);
    await expect(
      page.getByRole("button", { name: "Finish style quiz" }),
    ).toBeVisible();
    // The session-scoped label must not leak into the standalone context.
    await expect(
      page.getByRole("button", { name: "Continue to my session" }),
    ).toHaveCount(0);
  } finally {
    await cleanupE2EUserByEmail(email);
  }
});
