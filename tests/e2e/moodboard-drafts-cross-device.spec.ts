import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  createSessionForClient,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
  disconnectTestDb,
} from "./db";

// Mood-board drafts used to live in localStorage, which broke as soon as
// a stylist signed in from a second device — they saw an empty Drafts
// rail despite having an in-progress board on their other browser. This
// spec proves the rail now hydrates from the canonical Board(type=
// MOODBOARD, sentAt=null) rows the new-moodboard page persists, so a
// fresh browser context (no shared localStorage) sees the same draft.

test.afterAll(async () => {
  await disconnectTestDb();
});

test("dashboard Drafts rail hydrates from DB across browser contexts", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const clientEmail = `draft-xdev-c-${ts}@e2e.wishi.test`;
  const stylistEmail = `draft-xdev-s-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_dxd_c_${ts}`,
    email: clientEmail,
    firstName: "Draft",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_dxd_s_${ts}`,
    email: stylistEmail,
    firstName: "Draft",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MINI",
  });

  // Seed one InspirationPhoto so the draft has visible content.
  const p = getPool();
  const inspirationId = `e2e_insp_${ts}`;
  await p.query(
    `INSERT INTO inspiration_photos (id, s3_key, url, category, tags, created_at, updated_at)
     VALUES ($1, $2, $3, 'female', ARRAY[]::text[], NOW(), NOW())`,
    [
      inspirationId,
      `inspiration/e2e-${ts}.jpg`,
      `https://placehold.co/400x600/abc/png?text=draft`,
    ],
  );

  try {
    // --- Device A: create a draft with one image
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await pageA.goto("/sign-in");
    await pageA.getByLabel("Email").fill(stylistEmail);
    await pageA.getByRole("button", { name: "Sign In" }).click();
    await expect(pageA).not.toHaveURL(/\/sign-in/);

    await pageA.goto(`/stylist/sessions/${session.id}/moodboards/new`);
    await expect(pageA.getByText("Create mood board")).toBeVisible();
    const tilesA = pageA.locator(".columns-4 > div");
    await expect(tilesA.first()).toBeVisible();
    await tilesA.nth(0).click();
    await expect.poll(async () => {
      const { rows } = await p.query(
        `SELECT COUNT(*) FROM board_photos bp JOIN boards b ON b.id = bp.board_id
           WHERE b.session_id = $1 AND b.sent_at IS NULL`,
        [session.id],
      );
      return Number(rows[0].count);
    }).toBe(1);
    await ctxA.close();

    // --- Device B: fresh browser context, no shared localStorage. Drafts rail
    //     must surface the one created on Device A.
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await pageB.goto("/sign-in");
    await pageB.getByLabel("Email").fill(stylistEmail);
    await pageB.getByRole("button", { name: "Sign In" }).click();
    await expect(pageB).not.toHaveURL(/\/sign-in/);

    await pageB.goto("/stylist/dashboard");
    await expect(pageB.getByText(/Drafts \(\d+\)/)).toBeVisible({ timeout: 10_000 });
    await expect(pageB.getByText("Draft Client")).toBeVisible();
    await expect(pageB.getByText(/^1 image · /)).toBeVisible();
    await ctxB.close();
  } finally {
    await p.query(
      `DELETE FROM board_photos WHERE board_id IN (SELECT id FROM boards WHERE session_id = $1)`,
      [session.id],
    );
    await p.query(`DELETE FROM boards WHERE session_id = $1`, [session.id]);
    await p.query(
      `DELETE FROM inspiration_photos WHERE id = $1`,
      [inspirationId],
    );
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
