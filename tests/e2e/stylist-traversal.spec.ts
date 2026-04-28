import { expect, test, type Page } from "@playwright/test";
import {
  ensureClientUser,
  ensureStylistUser,
  ensureStylistProfile,
  createSessionForClient,
  cleanupStylistProfile,
  cleanupE2EUserByEmail,
  getPool,
} from "./db";
import {
  installFailureGuards,
  expectNoErrorBoundary,
  gotoAndAssertOk,
} from "./fixtures/traversal";

/**
 * Stylist traversal — walks the (stylist) route group as a signed-in
 * stylist with one ACTIVE session in their queue. Asserts every primary
 * stylist surface renders without crashing the route-group error boundary.
 *
 * The proxy gate that redirects mid-onboarding stylists away from
 * `/stylist/*` short-circuits in E2E mode (see CLAUDE.md "Proxy onboarding
 * gate"), so we don't have to advance the onboarding wizard before
 * walking the dashboard.
 *
 * Twilio-dependent paths (chat fan-out, board sends) are deliberately
 * skipped — they live in `boards.spec.ts` / `chat.spec.ts` and need a
 * live Twilio tenant.
 */

async function signInAsStylist(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/(stylist|sessions|onboarding)/);
}

test("stylist walks dashboard → sessions → workspace → clients → profile boards → payouts without error boundary", async ({
  page,
}) => {
  installFailureGuards(page);

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clientEmail = `st-trav-client-${stamp}@e2e.wishi.test`;
  const stylistEmail = `st-trav-stylist-${stamp}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_st_trav_client_${stamp}`,
    email: clientEmail,
    firstName: "Roster",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_st_trav_stylist_${stamp}`,
    email: stylistEmail,
    firstName: "Traversal",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });
  // Workspace renders only when there's a Twilio channel SID — stamp a
  // placeholder so the page exits the redirect-to-detail short-circuit.
  await getPool().query(
    `UPDATE sessions SET twilio_channel_sid = $1 WHERE id = $2`,
    [`CH_e2e_traversal_${stamp}`, session.id],
  );

  try {
    await signInAsStylist(page, stylistEmail);

    // Each route is the primary surface in its area of the stylist app.
    // Workspace + dashboard right-rail call into Twilio mirrors but the
    // page itself renders without a live tenant.
    const surfaces: string[] = [
      "/stylist/dashboard",
      "/stylist/sessions",
      `/stylist/sessions/${session.id}`,
      `/stylist/sessions/${session.id}/workspace`,
      "/stylist/clients",
      `/stylist/clients/${client.id}`,
      "/stylist/profile/boards",
      "/stylist/payouts",
    ];

    for (const path of surfaces) {
      await gotoAndAssertOk(page, path);
    }

    // Sanity check: dashboard shows the seeded client's name in the queue
    await page.goto("/stylist/dashboard");
    await page.waitForLoadState("networkidle");
    const body = await page.locator("body").innerText();
    expect(body, "dashboard surfaces seeded client").toContain("Roster Client");
    await expectNoErrorBoundary(page);
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
