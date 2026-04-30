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

interface Ctx {
  client: { id: string; email: string };
  stylist: { id: string; email: string };
  session: { id: string };
  inspirationIds: string[];
  cleanup: () => Promise<void>;
}

async function setup(): Promise<Ctx> {
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const clientEmail = `mood-build-c-${ts}@e2e.wishi.test`;
  const stylistEmail = `mood-build-s-${ts}@e2e.wishi.test`;
  const client = await ensureClientUser({
    clerkId: `e2e_mb_c_${ts}`,
    email: clientEmail,
    firstName: "Mood",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_mb_s_${ts}`,
    email: stylistEmail,
    firstName: "Mood",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MINI",
  });

  // Seed 5 InspirationPhoto rows for this test. URLs are dummy placeholders
  // pointing nowhere real (they only need to render <img> tags whose `src` is
  // a valid string for the click handler — Image rendering errors don't fail
  // the test).
  const p = getPool();
  const inspirationIds: string[] = [];
  for (let i = 0; i < 5; i++) {
    const id = `e2e_insp_${ts}_${i}`;
    await p.query(
      `INSERT INTO inspiration_photos (id, s3_key, url, category, tags, created_at, updated_at)
       VALUES ($1, $2, $3, 'female', ARRAY[]::text[], NOW(), NOW())`,
      [
        id,
        `inspiration/e2e-${ts}-${i}.jpg`,
        `https://placehold.co/400x600/${i}${i}${i}/png?text=insp${i}`,
      ],
    );
    inspirationIds.push(id);
  }

  return {
    client: { id: client.id, email: clientEmail },
    stylist: { id: stylist.id, email: stylistEmail },
    session: { id: session.id },
    inspirationIds,
    cleanup: async () => {
      const p = getPool();
      await p.query(
        `DELETE FROM board_photos WHERE board_id IN (SELECT id FROM boards WHERE session_id = $1)`,
        [session.id],
      );
      await p.query(`DELETE FROM boards WHERE session_id = $1`, [session.id]);
      await p.query(
        `DELETE FROM inspiration_photos WHERE id = ANY($1::text[])`,
        [inspirationIds],
      );
      await cleanupStylistProfile(stylist.id);
      await cleanupE2EUserByEmail(clientEmail);
      await cleanupE2EUserByEmail(stylistEmail);
    },
  };
}

async function getPhotos(sessionId: string) {
  const { rows } = await getPool().query(
    `SELECT bp.id, bp.url, bp.s3_key, bp.inspiration_photo_id, bp.order_index
       FROM board_photos bp
       JOIN boards b ON b.id = bp.board_id
      WHERE b.session_id = $1
   ORDER BY bp.order_index ASC`,
    [sessionId],
  );
  return rows;
}

test.afterAll(async () => {
  await disconnectTestDb();
});

test.describe("Moodboard builder photo persistence", () => {
  test("clicking an inspiration image POSTs to /api/moodboards/:id/photos and re-renders on reload", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const ctx = await setup();
    try {
      const page = await (await browser.newContext()).newPage();
      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(ctx.stylist.email);
      await page.getByRole("button", { name: "Sign In" }).click();
      await expect(page).not.toHaveURL(/\/sign-in/);

      // Land on the new-moodboard builder; the page lazy-creates a draft Board.
      await page.goto(`/stylist/sessions/${ctx.session.id}/moodboards/new`);
      await expect(page.getByText("Create mood board")).toBeVisible();

      // Click 3 inspiration tiles. The verbatim chrome shows them as
      // <img>/<Image> in a columns-4 grid wrapped in cursor-pointer divs.
      const tiles = page.locator(".columns-4 > div");
      await expect(tiles.first()).toBeVisible();
      await tiles.nth(0).click();
      await tiles.nth(1).click();
      await tiles.nth(2).click();

      // Wait until the server registered all 3 photos.
      await expect
        .poll(async () => (await getPhotos(ctx.session.id)).length, {
          timeout: 10_000,
        })
        .toBe(3);

      // Reload — the page should re-hydrate from DB with the 3 photos
      // pre-populated (no draft re-add needed).
      await page.reload();
      await expect(page.getByText("3/9 images")).toBeVisible();

      // Persisted BoardPhoto rows must carry s3_key + url + inspirationPhotoId
      // pointing at one of the seeded InspirationPhoto rows.
      const photos = await getPhotos(ctx.session.id);
      for (const p of photos) {
        expect(p.s3_key).toMatch(/^inspiration\/e2e-\d+-\d+\.jpg$/);
        expect(p.url).toMatch(/^https:\/\/placehold\.co\//);
        expect(ctx.inspirationIds).toContain(p.inspiration_photo_id);
      }
    } finally {
      await ctx.cleanup();
    }
  });
});
