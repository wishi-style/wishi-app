import { expect, test, type Page } from "@playwright/test";
import {
  ensureClientUser,
  ensureStylistUser,
  createSessionForClient,
  cleanupE2EUserByEmail,
  getPool,
} from "./db";

/**
 * StylingRoom shell layout from the post-Phase-10 design refresh.
 * Adds a thin SessionHeaderBar above the workspace tabs containing a
 * back-to-sessions chevron + stylist avatar + name + plan label.
 *
 * Verifies that:
 *   - the new header bar renders the stylist's name and plan label
 *   - the back chevron points at /sessions
 *   - the existing tab strip + sidebar still render below
 *
 * Needs a real session row with a non-null twilio_channel_sid (the page
 * redirects to /sessions/[id] otherwise) — the SID is fake-stamped here
 * because the spec only inspects the shell, not the live chat transport.
 */

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/(sessions|stylist|match-quiz)/);
}

test("/sessions/[id]/chat renders SessionHeaderBar with stylist + plan label", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clientEmail = `styling-room-client-${stamp}@e2e.wishi.test`;
  const stylistEmail = `styling-room-stylist-${stamp}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_sr_client_${stamp}`,
    email: clientEmail,
    firstName: "Shell",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_sr_stylist_${stamp}`,
    email: stylistEmail,
    firstName: "Mika",
    lastName: "Stylist",
  });

  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    planType: "MAJOR",
    status: "ACTIVE",
  });

  // The chat page redirects when twilio_channel_sid is null. Stamp a fake
  // SID — the SessionHeaderBar test doesn't exercise live chat transport.
  await getPool().query(
    `UPDATE sessions SET twilio_channel_sid = $1 WHERE id = $2`,
    [`CH_e2e_${stamp}`, session.id],
  );

  try {
    await signIn(page, clientEmail);
    await page.goto(`/sessions/${session.id}/chat`);
    await page.waitForLoadState("networkidle");

    // Header bar
    await expect(
      page.getByRole("link", { name: "Back to sessions" }),
    ).toHaveAttribute("href", "/sessions");
    const body = await page.locator("body").innerText();
    expect(body).toContain("Mika Stylist");
    expect(body.toLowerCase()).toContain("wishi major");

    // Tab strip below still renders
    await expect(page.getByRole("button", { name: "Chat" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Styleboards/i })).toBeVisible();
  } finally {
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
