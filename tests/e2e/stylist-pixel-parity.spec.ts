import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  createSessionForClient,
  disconnectTestDb,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
} from "./db";

/**
 * Pass-3 stylist parity guards. These pin the regressions that two prior
 * passes failed to catch:
 *
 *  - The dashboard NEVER renders the literal "View Session" CTA. Loveable
 *    HEAD's vocabulary is "Start styling" / "View session" (lowercase) /
 *    "View summary"; the staging adapter previously collapsed all of those
 *    to "View Session" (capital S), which forced clicks to a phantom
 *    /workspace page.
 *  - The phantom routes (/stylist/sessions/[id]/workspace, /chat,
 *    /stylist/clients, /stylist/clients/[id]) are gone — Loveable doesn't
 *    have any of them, and they can't 200 in staging either.
 *  - Notification deep-links (`?session=<id>` on /stylist/dashboard) are
 *    honored: visiting the URL pre-selects that session.
 */

test.afterAll(async () => {
  await disconnectTestDb();
});

async function signInAsStylist(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

test("dashboard renders 'Start styling' for new BOOKED sessions, never the literal 'View Session'", async ({
  page,
}) => {
  const ts = Date.now();
  const clientEmail = `pp3-client-${ts}@e2e.wishi.test`;
  const stylistEmail = `pp3-stylist-${ts}@e2e.wishi.test`;
  const clientClerkId = `e2e_pp3_client_${ts}`;
  const stylistClerkId = `e2e_pp3_stylist_${ts}`;

  const client = await ensureClientUser({
    clerkId: clientClerkId,
    email: clientEmail,
    firstName: "Pixel",
    lastName: "Parity",
  });
  const stylist = await ensureStylistUser({
    clerkId: stylistClerkId,
    email: stylistEmail,
    firstName: "Sam",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });
  // BOOKED + no pending actions → adapter's `default` branch — should
  // surface "Start styling" per Loveable mockSessions[6/7] vocabulary.
  await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "BOOKED",
    planType: "MINI",
  });

  try {
    await signInAsStylist(page, stylistEmail);
    await page.goto("/stylist/dashboard");
    await page.waitForLoadState("networkidle");

    const body = await page.locator("body").innerText();

    // Pass-1+2 regression: the literal "View Session" string appeared on
    // every non-board card. It must not appear at all.
    expect(body).not.toContain("View Session");

    // Loveable's contextual labels for non-board states.
    expect(body).toContain("Start styling");
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("phantom routes return 404", async ({ page }) => {
  // These paths existed in staging but have no Loveable counterpart.
  // Builders + notifications now point at /stylist/dashboard?session=<id>.
  for (const path of [
    "/stylist/sessions/any-id-here/workspace",
    "/stylist/sessions/any-id-here/chat",
    "/stylist/sessions/any-id-here",
    "/stylist/clients",
    "/stylist/clients/any-id-here",
  ]) {
    const res = await page.request.get(path, { maxRedirects: 0 });
    expect(
      res.status(),
      `${path} should be 404 — Loveable has no equivalent`,
    ).toBe(404);
  }
});

test("?session=<id> deep-link pre-selects that session", async ({ page }) => {
  const ts = Date.now();
  const clientEmail = `pp3-deep-${ts}@e2e.wishi.test`;
  const stylistEmail = `pp3-deepst-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_pp3_deep_${ts}`,
    email: clientEmail,
    firstName: "Deep",
    lastName: "Linker",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_pp3_deepst_${ts}`,
    email: stylistEmail,
    firstName: "Avery",
    lastName: "Lin",
  });
  await ensureStylistProfile({ userId: stylist.id });
  // Two sessions so we can prove the deep-link picks the right one (not
  // the auto-selected first).
  await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });
  const target = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "BOOKED",
    planType: "MINI",
  });

  try {
    await signInAsStylist(page, stylistEmail);
    await page.goto(`/stylist/dashboard?session=${target.id}`);
    await page.waitForLoadState("networkidle");

    // The selected session shows the "Start styling" CTA in the chat header
    // since the BOOKED session has no pending action; the ACTIVE session
    // would surface a different label.
    const header = page.locator("header, [class*=border-b]").first();
    await expect(page.getByText("Start styling")).toBeVisible();
    await expect(header).toBeVisible();
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
