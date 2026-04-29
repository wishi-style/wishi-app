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
 * §3.3 + §3.4 — `/sessions` list rebuilt to Loveable's SessionCard contract
 * and the chat-link redirect hop dropped.
 *
 *  - SessionCard renders stylist name + plan badge + relative-time +
 *    status-aware action CTA
 *  - Active sessions with a Twilio channel link straight to `/sessions/[id]/chat`
 *    (no /sessions/[id] redirect hop)
 *  - PENDING_END_APPROVAL CTA points at `/end-session`
 *  - COMPLETED sessions surface a "Book {stylist} Again" CTA pointing at the
 *    stylist's public profile
 *  - An unrated sent board flips the card into "Review Style Board" priority
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

test("sessions list renders Loveable cards with status-aware CTAs", async ({ page }) => {
  const ts = Date.now();
  const clientEmail = `sl-c-${ts}@e2e.wishi.test`;
  const stylistEmail = `sl-s-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_sl_c_${ts}`,
    email: clientEmail,
    firstName: "List",
    lastName: "Viewer",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_sl_s_${ts}`,
    email: stylistEmail,
    firstName: "Maya",
    lastName: "Brooks",
  });
  const stylistProfile = await ensureStylistProfile({ userId: stylist.id });

  // Three sessions cover the major card states:
  //  - active w/ channel → "View Session" + chat link
  //  - PENDING_END_APPROVAL → "Approve End" + end-session link
  //  - COMPLETED → "Book Maya Again" + stylist profile link
  const active = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });
  const awaiting = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "PENDING_END_APPROVAL",
    planType: "MINI",
  });
  const completed = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "COMPLETED",
    planType: "LUX",
  });

  // Stamp twilio channel SIDs so the card links go to /chat directly
  // instead of falling back to /sessions/[id].
  const pool = getPool();
  await pool.query(
    `UPDATE sessions SET twilio_channel_sid = $1 WHERE id = $2`,
    [`CH_e2e_sl_active_${ts}`, active.id],
  );
  await pool.query(
    `UPDATE sessions SET twilio_channel_sid = $1, completed_at = NOW() WHERE id = $2`,
    [`CH_e2e_sl_done_${ts}`, completed.id],
  );

  try {
    await signIn(page, clientEmail);
    await page.goto("/sessions");
    await page.waitForLoadState("networkidle");

    const body = await page.locator("body").innerText();
    expect(body).toContain("Maya Brooks");
    // Plan badges render with the `uppercase` Tailwind class, so innerText
    // returns "MAJOR"/"MINI"/"LUX". Match case-insensitive.
    expect(body).toMatch(/Major/i);
    expect(body).toMatch(/Mini/i);
    expect(body).toMatch(/Lux/i);

    // Status-aware CTA labels.
    await expect(page.getByRole("link", { name: "View Session" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Approve End" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Book Maya Again" }),
    ).toBeVisible();

    // §3.4 — active session card jumps straight to /chat, not the
    // /sessions/[id] detail hop.
    const viewSessionHref = await page
      .getByRole("link", { name: "View Session" })
      .getAttribute("href");
    expect(viewSessionHref).toBe(`/sessions/${active.id}/chat`);

    // PENDING_END_APPROVAL routes to the end-session modal page.
    const approveHref = await page
      .getByRole("link", { name: "Approve End" })
      .getAttribute("href");
    expect(approveHref).toBe(`/sessions/${awaiting.id}/end-session`);

    // COMPLETED uses the stylist's public profile id, not the user id.
    const bookAgainHref = await page
      .getByRole("link", { name: "Book Maya Again" })
      .getAttribute("href");
    expect(bookAgainHref).toBe(`/stylists/${stylistProfile.id}`);
  } finally {
    await pool.query(
      `DELETE FROM session_pending_actions WHERE session_id IN ($1,$2,$3)`,
      [active.id, awaiting.id, completed.id],
    );
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("unrated sent board flips card to Review Style Board priority", async ({ page }) => {
  const ts = Date.now() + 1;
  const clientEmail = `sl-board-c-${ts}@e2e.wishi.test`;
  const stylistEmail = `sl-board-s-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_sl_board_c_${ts}`,
    email: clientEmail,
    firstName: "Board",
    lastName: "Watcher",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_sl_board_s_${ts}`,
    email: stylistEmail,
    firstName: "Iris",
    lastName: "Park",
  });
  const stylistProfile = await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });
  const pool = getPool();
  await pool.query(
    `UPDATE sessions SET twilio_channel_sid = $1 WHERE id = $2`,
    [`CH_e2e_sl_board_${ts}`, session.id],
  );
  // A sent + unrated styleboard for this session lights up the high-priority
  // "Review Style Board" CTA.
  await pool.query(
    `INSERT INTO boards (id, type, session_id, stylist_profile_id, is_revision, sent_at, created_at, updated_at)
     VALUES ($1, 'STYLEBOARD', $2, $3, false, NOW(), NOW(), NOW())`,
    [`board_e2e_sl_${ts}`, session.id, stylistProfile.id],
  );

  try {
    await signIn(page, clientEmail);
    await page.goto("/sessions");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("link", { name: "Review Style Board" })).toBeVisible();
  } finally {
    await pool.query(`DELETE FROM boards WHERE id = $1`, [`board_e2e_sl_${ts}`]);
    await pool.query(
      `DELETE FROM session_pending_actions WHERE session_id = $1`,
      [session.id],
    );
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
