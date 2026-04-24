import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
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

// Reproduces the "Access denied when stylist clicks Open on a styleboard
// they sent" bug and pins the fix: stylist-side viewer routes under
// /stylist/sessions/[id]/{styleboards,moodboards}/[boardId] must render
// the read-only viewer, not the (client) route-group's forbidden wall.

test.afterAll(async () => {
  await disconnectTestDb();
});

async function insertBoard({
  sessionId,
  type,
}: {
  sessionId: string;
  type: "STYLEBOARD" | "MOODBOARD";
}) {
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO boards (id, type, session_id, sent_at, created_at, updated_at)
     VALUES ($1, $2::"BoardType", $3, NOW(), NOW(), NOW())`,
    [id, type, sessionId],
  );
  return id;
}

test("stylist can open a styleboard from chat (no Access denied)", async ({
  page,
}) => {
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const clientEmail = `sb-viewer-client-${ts}@e2e.wishi.test`;
  const stylistEmail = `sb-viewer-stylist-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_sb_viewer_client_${ts}`,
    email: clientEmail,
    firstName: "SB",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_sb_viewer_stylist_${ts}`,
    email: stylistEmail,
    firstName: "SB",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
  });
  const styleboardId = await insertBoard({
    sessionId: session.id,
    type: "STYLEBOARD",
  });
  const moodboardId = await insertBoard({
    sessionId: session.id,
    type: "MOODBOARD",
  });

  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(stylistEmail);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/(sessions|stylist)/);

    // Styleboard viewer
    await page.goto(`/stylist/sessions/${session.id}/styleboards/${styleboardId}`);
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading", { name: /Styleboard/i }),
    ).toBeVisible();
    const sbBody = await page.locator("body").innerText();
    expect(sbBody, "stylist sees viewer, not Access denied").not.toContain(
      "Access denied",
    );

    // Moodboard viewer
    await page.goto(`/stylist/sessions/${session.id}/moodboards/${moodboardId}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /Moodboard/i })).toBeVisible();
    const mbBody = await page.locator("body").innerText();
    expect(mbBody, "stylist sees viewer, not Access denied").not.toContain(
      "Access denied",
    );

    // Regression: the (client) route group must still forbid stylists from the
    // client URL (proves we didn't regress the layout gate while fixing this).
    const forbidden = await page.goto(
      `/sessions/${session.id}/styleboards/${styleboardId}`,
    );
    expect(forbidden?.status(), "client URL forbids stylist").toBeGreaterThanOrEqual(400);
  } finally {
    await getPool().query(`DELETE FROM boards WHERE session_id = $1`, [session.id]);
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
