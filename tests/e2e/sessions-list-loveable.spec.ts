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
 * `/sessions` list — SessionCard contract.
 *
 *  - SessionCard renders stylist name + plan badge + relative-time +
 *    status-aware action CTA
 *  - ACTIVE sessions link straight to `/sessions/[id]/chat`
 *  - PENDING_END_APPROVAL CTA points at `/end-session`
 *  - Terminal sessions (COMPLETED / CANCELLED / FROZEN / REASSIGNED) surface
 *    a "Rebook {stylist}" CTA pointing at the stylist's public profile
 *  - An unrated sent board flips the card into a high-priority "Review …"
 *    CTA. Label varies by board kind:
 *      MOODBOARD                → "Review Moodboard"
 *      STYLEBOARD               → "Review Styleboard"
 *      STYLEBOARD (isRevision)  → "Review Revised Look"
 *    All three MUST link to `/sessions/[id]/chat`. The chat surface renders
 *    the board inline as a card with rate + RestyleWizard pills — there is
 *    no standalone `/sessions/[id]/{moodboards,styleboards}/[boardId]`
 *    viewer in the client tree, and any link that points there 404s.
 */

test.afterAll(async () => {
  await disconnectTestDb();
});

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-in?e2e=1");
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
  //  - active w/ channel → "Open Chat" + chat link
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
    await expect(page.getByRole("link", { name: "Open Chat" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Approve End" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Rebook Maya" }),
    ).toBeVisible();

    // Active session card jumps straight to /chat, not the /sessions/[id]
    // detail hop.
    const openChatHref = await page
      .getByRole("link", { name: "Open Chat" })
      .getAttribute("href");
    expect(openChatHref).toBe(`/sessions/${active.id}/chat`);

    // PENDING_END_APPROVAL routes to the end-session modal page.
    const approveHref = await page
      .getByRole("link", { name: "Approve End" })
      .getAttribute("href");
    expect(approveHref).toBe(`/sessions/${awaiting.id}/end-session`);

    // COMPLETED uses the stylist's public profile id, not the user id.
    const rebookHref = await page
      .getByRole("link", { name: "Rebook Maya" })
      .getAttribute("href");
    expect(rebookHref).toBe(`/stylists/${stylistProfile.id}`);
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

// Each new_board variant: card label + URL the CTA must point at. ALL go
// to /chat — there is no /sessions/[id]/{moodboards,styleboards}/[boardId]
// page in the client tree. A regression here is what landed users on the
// global 404 ("Oops! This page couldn't be found") after tapping a styleboard
// notification.
const NEW_BOARD_VARIANTS = [
  {
    name: "moodboard",
    label: "Review Moodboard",
    boardType: "MOODBOARD" as const,
    isRevision: false,
  },
  {
    name: "styleboard",
    label: "Review Styleboard",
    boardType: "STYLEBOARD" as const,
    isRevision: false,
  },
  {
    name: "restyle revision",
    label: "Review Revised Look",
    boardType: "STYLEBOARD" as const,
    isRevision: true,
  },
];

for (const variant of NEW_BOARD_VARIANTS) {
  test(`unrated sent ${variant.name} → "${variant.label}" CTA links to /chat`, async ({
    page,
  }) => {
    const ts = Date.now() + Math.floor(Math.random() * 1000);
    const slug = variant.name.replace(/\s+/g, "-");
    const clientEmail = `sl-${slug}-c-${ts}@e2e.wishi.test`;
    const stylistEmail = `sl-${slug}-s-${ts}@e2e.wishi.test`;

    const client = await ensureClientUser({
      clerkId: `e2e_sl_${slug}_c_${ts}`,
      email: clientEmail,
      firstName: "Board",
      lastName: "Watcher",
    });
    const stylist = await ensureStylistUser({
      clerkId: `e2e_sl_${slug}_s_${ts}`,
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
      [`CH_e2e_sl_${slug}_${ts}`, session.id],
    );
    const boardId = `board_e2e_sl_${slug}_${ts}`;
    await pool.query(
      `INSERT INTO boards (id, type, session_id, stylist_profile_id, is_revision, sent_at, created_at, updated_at)
       VALUES ($1, $2::"BoardType", $3, $4, $5, NOW(), NOW(), NOW())`,
      [boardId, variant.boardType, session.id, stylistProfile.id, variant.isRevision],
    );

    try {
      await signIn(page, clientEmail);
      await page.goto("/sessions");
      await page.waitForLoadState("networkidle");

      const cta = page.getByRole("link", { name: variant.label });
      await expect(cta).toBeVisible();
      // Regression guard for the broken "/sessions/[id]/{path}/[boardId]"
      // dead-link bug — the chat page is the only place that renders the
      // board card inline with rate/restyle pills.
      expect(await cta.getAttribute("href")).toBe(
        `/sessions/${session.id}/chat`,
      );
    } finally {
      await pool.query(`DELETE FROM boards WHERE id = $1`, [boardId]);
      await pool.query(
        `DELETE FROM session_pending_actions WHERE session_id = $1`,
        [session.id],
      );
      await cleanupStylistProfile(stylist.id);
      await cleanupE2EUserByEmail(clientEmail);
      await cleanupE2EUserByEmail(stylistEmail);
    }
  });
}
