import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  createSessionForClient,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
} from "./db";
import { expectNoErrorBoundary, installFailureGuards } from "./fixtures/traversal";

/**
 * Past sessions stay accessible.
 *
 * A COMPLETED / CANCELLED session card on /sessions used to only expose a
 * "Rebook {firstName}" button that linked to the stylist's profile — the
 * client could never get back to the chat history (with the moodboards /
 * styleboards / messages preserved). The chat page itself has always
 * allowed these statuses (CHAT_STATUSES includes COMPLETED, CANCELLED,
 * REASSIGNED); the affordance was missing from the list.
 *
 * This spec pins:
 *   - Past-session card carries BOTH an overlay link to /sessions/{id}/chat
 *     (the "card click → recap" affordance) AND the "Rebook {firstName}"
 *     button pointing at the stylist profile.
 *   - Clicking the card body lands on the chat page without falling through
 *     to a redirect.
 */

test("past-session card opens chat and keeps Rebook button", async ({ page }) => {
  installFailureGuards(page);

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clientEmail = `past-c-${stamp}@e2e.wishi.test`;
  const stylistEmail = `past-s-${stamp}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_past_c_${stamp}`,
    email: clientEmail,
    firstName: "Past",
    lastName: "Viewer",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_past_s_${stamp}`,
    email: stylistEmail,
    firstName: "Recap",
    lastName: "Stylist",
  });
  const stylistProfile = await ensureStylistProfile({ userId: stylist.id });

  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "COMPLETED",
    planType: "MAJOR",
  });

  try {
    await page.goto("/sign-in?e2e=1");
    await page.getByLabel("Email").fill(clientEmail);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).not.toHaveURL(/\/sign-in/);

    await page.goto("/sessions");
    await page.waitForLoadState("networkidle");
    await expectNoErrorBoundary(page);

    // Card exposes the chat overlay link (one per terminal card).
    const chatLink = page.locator(`a[href="/sessions/${session.id}/chat"]`);
    await expect(chatLink).toHaveCount(1);
    await expect(chatLink).toHaveAttribute(
      "aria-label",
      /Open chat with Recap Stylist/,
    );

    // Rebook button still renders and still points at the stylist profile.
    const rebook = page.getByRole("link", { name: /Rebook Recap/ });
    await expect(rebook).toBeVisible();
    await expect(rebook).toHaveAttribute(
      "href",
      `/stylists/${stylistProfile.id}`,
    );

    // Clicking the card body (the overlay link) lands on the chat page.
    await chatLink.click();
    await expect(page).toHaveURL(new RegExp(`/sessions/${session.id}/chat`));
    await expectNoErrorBoundary(page);
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
    void session;
  }
});
