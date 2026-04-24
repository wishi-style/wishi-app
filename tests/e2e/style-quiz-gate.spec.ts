import { expect, test, type Page } from "@playwright/test";
import {
  ensureClientUser,
  ensureStylistUser,
  ensureStylistProfile,
  cleanupStylistProfile,
  cleanupE2EUserByEmail,
  getPool,
} from "./db";

/**
 * Style-quiz pre-booking gate.
 *
 * Funnel intent (per founder, 2026-04-24): the style quiz is a required
 * step between stylist-selection and payment, on BOTH paths —
 *   (A) match-quiz → /matches → click through to /stylists/[id]
 *   (B) direct click on /stylists/[id] from the public directory.
 * Returning clients who already have a completed StyleProfile bypass
 * the quiz and go straight to /bookings/new.
 *
 * This spec stays on the "click Continue on /stylists/[id]" hop because
 * that's where both funnels converge — the CTA href is what flips.
 */

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/(sessions|stylist|match-quiz)/);
}

test("authed client with no StyleProfile: Continue routes through /style-quiz", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clientEmail = `sq-gate-client-${stamp}@e2e.wishi.test`;
  const stylistEmail = `sq-gate-stylist-${stamp}@e2e.wishi.test`;

  await ensureClientUser({
    clerkId: `e2e_sq_gate_client_${stamp}`,
    email: clientEmail,
    firstName: "Quiz",
    lastName: "Taker",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_sq_gate_stylist_${stamp}`,
    email: stylistEmail,
    firstName: "Petra",
    lastName: "Gate",
  });
  const profile = await ensureStylistProfile({ userId: stylist.id });

  try {
    await signIn(page, clientEmail);
    await page.goto(`/stylists/${profile.id}`);
    await page.waitForLoadState("networkidle");

    // CTA should point at /style-quiz, not /bookings/new
    const cta = page
      .getByRole("link", { name: /Continue with Petra/i })
      .first();
    await expect(cta).toHaveAttribute("href", `/style-quiz?stylistId=${profile.id}`);

    await cta.click();
    await expect(page).toHaveURL(
      new RegExp(`/style-quiz\\?stylistId=${profile.id}`),
    );
    // First question renders from the seeded STYLE_PREFERENCE quiz
    await expect(
      page.getByText(/personal style/i).first(),
    ).toBeVisible();
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("authed client with completed StyleProfile: Continue skips /style-quiz", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clientEmail = `sq-skip-client-${stamp}@e2e.wishi.test`;
  const stylistEmail = `sq-skip-stylist-${stamp}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_sq_skip_client_${stamp}`,
    email: clientEmail,
    firstName: "Repeat",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_sq_skip_stylist_${stamp}`,
    email: stylistEmail,
    firstName: "Noa",
    lastName: "Skip",
  });
  const profile = await ensureStylistProfile({ userId: stylist.id });

  // Stamp a completed StyleProfile so the gate skips.
  await getPool().query(
    `INSERT INTO style_profiles (id, user_id, quiz_completed_at, quiz_answers, created_at, updated_at)
     VALUES ($1, $2, NOW(), '{}'::jsonb, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET quiz_completed_at = NOW()`,
    [`sp_${stamp}`, client.id],
  );

  try {
    await signIn(page, clientEmail);
    await page.goto(`/stylists/${profile.id}`);
    await page.waitForLoadState("networkidle");

    const cta = page
      .getByRole("link", { name: /Continue with Noa/i })
      .first();
    await expect(cta).toHaveAttribute(
      "href",
      `/bookings/new?stylistId=${profile.id}`,
    );
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("unauthed visitor: Continue goes to /bookings/new and sign-in bounce handles auth", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const stylistEmail = `sq-anon-stylist-${stamp}@e2e.wishi.test`;

  const stylist = await ensureStylistUser({
    clerkId: `e2e_sq_anon_${stamp}`,
    email: stylistEmail,
    firstName: "Ruby",
    lastName: "Public",
  });
  const profile = await ensureStylistProfile({ userId: stylist.id });

  try {
    await page.goto(`/stylists/${profile.id}`);
    await page.waitForLoadState("networkidle");

    // Unauth = no styleQuizCompleted lookup, so href falls through to /bookings/new.
    // /bookings/new is itself protected and will bounce to /sign-in when clicked.
    const cta = page.getByRole("link", { name: /Continue with Ruby/i }).first();
    await expect(cta).toHaveAttribute(
      "href",
      `/bookings/new?stylistId=${profile.id}`,
    );
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
