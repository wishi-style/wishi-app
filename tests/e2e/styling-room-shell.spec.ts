import { expect, test, type Page } from "@playwright/test";
import {
  ensureClientUser,
  ensureStylistUser,
  createSessionForClient,
  cleanupE2EUserByEmail,
  getPool,
} from "./db";

/**
 * StylingRoom shell — Loveable parity layout. The 256px left rail subsumes
 * the back arrow + stylist avatar + name + plan badge, and the workspace
 * tabs run vertically inside it (Chat / Style Boards / Curated Pieces /
 * Cart). The earlier slim SessionHeaderBar above a horizontal tab strip
 * is gone.
 *
 * Verifies that:
 *   - the left rail shows the stylist's name + a Major plan badge
 *   - the "Back to Sessions" link points at /sessions
 *   - the vertical tab list contains Chat + Style Boards
 *
 * Needs a real session row with a non-null twilio_channel_sid (the page
 * redirects to /sessions/[id] otherwise) — the SID is fake-stamped here
 * because the spec only inspects the shell, not the live chat transport.
 */

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

test("/sessions/[id]/chat renders Loveable left rail with stylist + plan badge + vertical tabs", async ({
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

    // Left rail: back link + stylist + plan badge
    await expect(
      page.getByRole("link", { name: "Back to Sessions" }),
    ).toHaveAttribute("href", "/sessions");
    const body = await page.locator("body").innerText();
    expect(body).toContain("Mika Stylist");
    expect(body).toContain("Major");

    // Vertical tab list inside the left rail
    await expect(page.getByRole("button", { name: "Chat" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Style Boards/i }),
    ).toBeVisible();
  } finally {
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
