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
 * /board/[boardId] — public-by-default styleboard share page.
 *
 * Access model per founder call 2026-04-24: anyone with the URL can see
 * the board (no token, no expiry, no auth). Only *sent* STYLEBOARDs are
 * shareable — drafts (sentAt null) 404, and moodboards + restyles are
 * out of scope for the public view.
 */

async function seedStylistWithSession(stamp: string) {
  const clientEmail = `board-client-${stamp}@e2e.wishi.test`;
  const stylistEmail = `board-stylist-${stamp}@e2e.wishi.test`;
  const client = await ensureClientUser({
    clerkId: `e2e_board_client_${stamp}`,
    email: clientEmail,
    firstName: "Aria",
    lastName: "Share",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_board_stylist_${stamp}`,
    email: stylistEmail,
    firstName: "Lena",
    lastName: "Public",
  });
  const profile = await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    planType: "MAJOR",
    status: "ACTIVE",
  });
  return { client, stylist, stylistEmail, clientEmail, profile, session };
}

async function createBoard(opts: {
  sessionId: string;
  sentAt: Date | null;
  title: string;
  stylistNote: string;
}) {
  const id = `board_${Math.random().toString(36).slice(2, 10)}`;
  await getPool().query(
    `INSERT INTO boards (id, type, session_id, title, stylist_note, sent_at, created_at, updated_at)
     VALUES ($1, 'STYLEBOARD', $2, $3, $4, $5, NOW(), NOW())`,
    [id, opts.sessionId, opts.title, opts.stylistNote, opts.sentAt],
  );
  return id;
}

async function deleteBoard(boardId: string) {
  await getPool().query(`DELETE FROM boards WHERE id = $1`, [boardId]);
}

test("/board/[id] renders publicly for a SENT styleboard", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const { stylist, stylistEmail, clientEmail, session, profile } =
    await seedStylistWithSession(stamp);

  const uniqueNote = `Curated for a weekend getaway (${stamp}).`;
  const boardId = await createBoard({
    sessionId: session.id,
    sentAt: new Date(),
    title: "Effortless Chic",
    stylistNote: uniqueNote,
  });

  try {
    const res = await page.goto(`/board/${boardId}`);
    expect(res?.status()).toBe(200);
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", { level: 1, name: "Effortless Chic" }),
    ).toBeVisible();

    const body = await page.locator("body").innerText();
    expect(body).toContain(uniqueNote);
    expect(body).toContain("Lena Public");
    expect(body).toContain("Want Lena to style you?");

    // The bottom CTA links to the stylist's profile by stylistProfileId
    const cta = page.getByRole("link", { name: /Continue with Lena/i });
    await expect(cta).toHaveAttribute("href", `/stylists/${profile.id}`);
  } finally {
    await deleteBoard(boardId);
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("/board/[id] 404s for a DRAFT styleboard (sentAt null)", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const { stylist, stylistEmail, clientEmail, session } =
    await seedStylistWithSession(stamp);

  const boardId = await createBoard({
    sessionId: session.id,
    sentAt: null,
    title: "Draft — not shared",
    stylistNote: "Work in progress.",
  });

  try {
    const res = await page.goto(`/board/${boardId}`);
    expect(res?.status()).toBe(404);
  } finally {
    await deleteBoard(boardId);
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("/board/[id] 404s for an unknown board id", async ({ page }) => {
  const res = await page.goto("/board/does-not-exist-12345");
  expect(res?.status()).toBe(404);
});
