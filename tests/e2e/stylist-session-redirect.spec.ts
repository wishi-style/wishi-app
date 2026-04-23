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

test.afterAll(async () => {
  await disconnectTestDb();
});

test("/stylist/sessions/[id] redirects stylist to /workspace", async ({ page }) => {
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const clientEmail = `redirect-client-${ts}@e2e.wishi.test`;
  const stylistEmail = `redirect-stylist-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_redirect_client_${ts}`,
    email: clientEmail,
    firstName: "Redirect",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_redirect_stylist_${ts}`,
    email: stylistEmail,
    firstName: "Redirect",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
  });
  // Workspace page bounces to /stylist/sessions if the session has no Twilio
  // channel. This test only cares about the bare-path → /workspace redirect,
  // so give the row a placeholder SID to let the workspace page render.
  await getPool().query(
    `UPDATE sessions SET twilio_channel_sid = $1 WHERE id = $2`,
    [`CH_e2e_redirect_${ts}`, session.id],
  );

  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(stylistEmail);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/(sessions|stylist)/);

    await page.goto(`/stylist/sessions/${session.id}`);
    await expect(page).toHaveURL(`/stylist/sessions/${session.id}/workspace`);
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
