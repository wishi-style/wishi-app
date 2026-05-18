import { expect, test } from "@playwright/test";
import {
  ensureClientUser,
  ensureStylistUser,
  ensureStylistProfile,
  createSessionForClient,
  cleanupStylistProfile,
  cleanupE2EUserByEmail,
  getPool,
} from "./db";

/**
 * BoardThumbnail invariant: a styleboard composed in the LookCreator (items
 * with x/y/zIndex canvas positions) must render the SAME composition on the
 * public /board/[id] share page that the stylist saw while building. The
 * regression we're guarding: the chat card and share page used to flatten the
 * canvas into a `columns-2` mosaic that visually dropped items 3+4 of a 4-item
 * board even though the right-hand product grid listed them.
 *
 * We can't easily drive Twilio in a Playwright spec, so we exercise the share
 * page directly (server-rendered, no transport in the path). The chat card
 * shares the same BoardThumbnail component, so a passing share-page render is
 * strong evidence the chat surface is correct too.
 */

async function seedBoardWith4Items(stamp: string) {
  const clientEmail = `bsr-c-${stamp}@e2e.wishi.test`;
  const stylistEmail = `bsr-s-${stamp}@e2e.wishi.test`;
  const client = await ensureClientUser({
    clerkId: `e2e_bsr_c_${stamp}`,
    email: clientEmail,
    firstName: "Aria",
    lastName: "Canvas",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_bsr_s_${stamp}`,
    email: stylistEmail,
    firstName: "Lena",
    lastName: "Canvas",
  });
  await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    planType: "MAJOR",
    status: "ACTIVE",
  });
  const boardId = `bsr_b_${stamp}`;
  await getPool().query(
    `INSERT INTO boards (id, type, session_id, title, stylist_note, sent_at, created_at, updated_at)
     VALUES ($1, 'STYLEBOARD', $2, 'Four-Item Look', 'Square canvas demo.', NOW(), NOW(), NOW())`,
    [boardId, session.id],
  );
  // 4 web items at distinct canvas positions — each quadrant.
  const positions: Array<{ x: number; y: number }> = [
    { x: 25, y: 25 },
    { x: 75, y: 25 },
    { x: 25, y: 75 },
    { x: 75, y: 75 },
  ];
  for (let i = 0; i < positions.length; i++) {
    const { x, y } = positions[i];
    await getPool().query(
      `INSERT INTO board_items (id, board_id, source, order_index, web_item_url, web_item_image_url, x, y, z_index, flip_h, flip_v, created_at, updated_at)
       VALUES ($1, $2, 'WEB_ADDED', $3, $4, $5, $6, $7, $8, false, false, NOW(), NOW())`,
      [
        `bsr_i_${stamp}_${i}`,
        boardId,
        i,
        `https://example.test/item-${i}`,
        `https://example.test/img-${i}.jpg`,
        x,
        y,
        i + 1,
      ],
    );
  }
  return { boardId, stylist, clientEmail, stylistEmail };
}

async function cleanupBoard(boardId: string) {
  await getPool().query(`DELETE FROM board_items WHERE board_id = $1`, [boardId]);
  await getPool().query(`DELETE FROM boards WHERE id = $1`, [boardId]);
}

test("/board/[id] renders every canvas item — no items dropped from the square", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const { boardId, stylist, clientEmail, stylistEmail } =
    await seedBoardWith4Items(stamp);

  try {
    const res = await page.goto(`/board/${boardId}`);
    expect(res?.status()).toBe(200);
    await page.waitForLoadState("networkidle");

    // The BoardThumbnail canvas wraps each tile in a `position: absolute`
    // div with explicit `left: N%; top: N%` so the chat/feed/profile/share
    // surfaces all reproduce the LookCreator composition. We assert that
    // four positioned tiles exist — proof the canvas renderer is wired,
    // not the legacy columns-2 mosaic that visually dropped items 3+4.
    // The page also lists items in a separate "Items" product grid below
    // the canvas; we don't count those (they don't carry left:/top: inline
    // styles, so the locator only matches the canvas tiles).
    const canvasTiles = page.locator(
      'div[style*="left:"][style*="top:"]',
    );
    expect(await canvasTiles.count()).toBeGreaterThanOrEqual(4);
    // And each canvas tile renders an <img> for its item image.
    const canvasImages = canvasTiles.locator(
      `img[src^="https://example.test/img-"]`,
    );
    expect(await canvasImages.count()).toBeGreaterThanOrEqual(4);
  } finally {
    await cleanupBoard(boardId);
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("/board/[id] honors per-item width and rotation from the free-form canvas", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clientEmail = `bsr-c-${stamp}@e2e.wishi.test`;
  const stylistEmail = `bsr-s-${stamp}@e2e.wishi.test`;
  const client = await ensureClientUser({
    clerkId: `e2e_bsr_c_${stamp}`,
    email: clientEmail,
    firstName: "Aria",
    lastName: "Free",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_bsr_s_${stamp}`,
    email: stylistEmail,
    firstName: "Lena",
    lastName: "Free",
  });
  await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    planType: "MAJOR",
    status: "ACTIVE",
  });
  const boardId = `bsr_w_${stamp}`;
  await getPool().query(
    `INSERT INTO boards (id, type, session_id, title, stylist_note, sent_at, created_at, updated_at)
     VALUES ($1, 'STYLEBOARD', $2, 'Free-form Canvas', 'Resized + rotated items.', NOW(), NOW(), NOW())`,
    [boardId, session.id],
  );
  // Three items with explicit width/rotation so the renderer must read them
  // through (not fall back to the 30% / 0deg legacy defaults).
  const items = [
    { x: 30, y: 30, width: 40, rotation: 0 },
    { x: 70, y: 50, width: 20, rotation: 15 },
    { x: 50, y: 80, width: 35, rotation: -10 },
  ];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await getPool().query(
      `INSERT INTO board_items (id, board_id, source, order_index, web_item_url, web_item_image_url, x, y, width, rotation, z_index, flip_h, flip_v, created_at, updated_at)
       VALUES ($1, $2, 'WEB_ADDED', $3, $4, $5, $6, $7, $8, $9, $10, false, false, NOW(), NOW())`,
      [
        `bsr_w_${stamp}_${i}`,
        boardId,
        i,
        `https://example.test/free-${i}`,
        `https://example.test/free-${i}.jpg`,
        it.x,
        it.y,
        it.width,
        it.rotation,
        i + 1,
      ],
    );
  }

  try {
    const res = await page.goto(`/board/${boardId}`);
    expect(res?.status()).toBe(200);
    await page.waitForLoadState("networkidle");

    // Every canvas tile carries inline `width: <N>%` derived from the
    // BoardItem.width column and a `rotate(<deg>deg)` in its transform.
    // We grep the DOM for the specific values rather than rely on layout
    // measurement, which is sensitive to viewport size.
    const html = await page.content();
    expect(html).toContain("width: 40%");
    expect(html).toContain("width: 20%");
    expect(html).toContain("width: 35%");
    expect(html).toContain("rotate(15deg)");
    expect(html).toContain("rotate(-10deg)");
  } finally {
    await cleanupBoard(boardId);
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
