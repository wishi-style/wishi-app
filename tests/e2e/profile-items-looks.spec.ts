import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
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
 * /profile contract after the rewire:
 *  - Items tab shows delivered-styleboard inventory items tagged "Shop" and
 *    user-uploaded closet items tagged "Closet". Collections tab is gone.
 *  - Looks tab shows every delivered styleboard for this client, regardless
 *    of favorite state, linking to /board/[id].
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

async function addBoardItem(
  boardId: string,
  inventoryProductId: string,
  orderIndex = 0,
) {
  const id = "bi_" + randomUUID().replace(/-/g, "").slice(0, 24);
  await getPool().query(
    `INSERT INTO board_items (id, board_id, source, order_index, inventory_product_id, created_at, updated_at)
     VALUES ($1, $2, 'INVENTORY', $3, $4, NOW(), NOW())`,
    [id, boardId, orderIndex, inventoryProductId],
  );
}

test("/profile surfaces delivered styleboards under Looks", async ({ page }) => {
  const ts = Date.now();
  const clientEmail = `prof-c-${ts}@e2e.wishi.test`;
  const stylistEmail = `prof-s-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_prof_c_${ts}`,
    email: clientEmail,
    firstName: "Profile",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_prof_s_${ts}`,
    email: stylistEmail,
    firstName: "Maya",
    lastName: "Brooks",
  });
  await ensureStylistProfile({ userId: stylist.id });

  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "COMPLETED",
    planType: "MAJOR",
  });
  const styleboard = await createBoardFixture({
    sessionId: session.id,
    type: "STYLEBOARD",
    title: "Spring Edit",
    sentMinutesAgo: 30,
  });
  await addBoardItem(styleboard.id, "PROD_A_" + ts);
  await addBoardItem(styleboard.id, "PROD_B_" + ts, 1);

  // Moodboard should NOT contribute to Looks.
  const moodboard = await createBoardFixture({
    sessionId: session.id,
    type: "MOODBOARD",
    sentMinutesAgo: 60,
  });
  await addBoardItem(moodboard.id, "PROD_MOOD_" + ts);

  try {
    await signIn(page, clientEmail);
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");

    // Tabs strip: Items + Looks, no Collections.
    await expect(page.getByRole("tab", { name: "Items" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Looks" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Collections" })).toHaveCount(0);

    // Looks tab — one delivered styleboard, no moodboard, link goes to /board/[id].
    await page.getByRole("tab", { name: "Looks" }).click();
    await expect(page.getByText("1 Look", { exact: false })).toBeVisible();
    const lookLink = page.locator(`a[href="/board/${styleboard.id}"]`);
    await expect(lookLink).toBeVisible();
    await expect(page.getByText(/Styled by Maya Brooks/)).toBeVisible();
  } finally {
    await getPool().query(`DELETE FROM board_items WHERE board_id IN ($1, $2)`, [
      styleboard.id,
      moodboard.id,
    ]);
    await getPool().query(`DELETE FROM boards WHERE session_id = $1`, [session.id]);
    await getPool().query(
      `DELETE FROM session_pending_actions WHERE session_id = $1`,
      [session.id],
    );
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("/profile Items tab tags user-uploaded closet items with the Closet chip", async ({
  page,
}) => {
  const ts = Date.now() + 1;
  const clientEmail = `prof-cl-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_prof_cl_c_${ts}`,
    email: clientEmail,
    firstName: "Closet",
    lastName: "User",
  });

  const closetId = "ci_" + randomUUID().replace(/-/g, "").slice(0, 22);
  await getPool().query(
    `INSERT INTO closet_items (id, user_id, s3_key, url, name, designer, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
    [
      closetId,
      client.id,
      `closet/${closetId}.jpg`,
      "https://example.test/closet.jpg",
      "Linen Shirt",
      "Acme",
    ],
  );

  try {
    await signIn(page, clientEmail);
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");

    const card = page.locator(`img[src="https://example.test/closet.jpg"]`);
    await expect(card).toBeVisible();

    const body = await page.locator("body").innerText();
    expect(body).toMatch(/Closet/);
  } finally {
    await getPool().query(`DELETE FROM closet_items WHERE id = $1`, [closetId]);
    await cleanupE2EUserByEmail(clientEmail);
  }
});
