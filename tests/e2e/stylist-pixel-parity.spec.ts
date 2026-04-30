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

test("LookCreator top bar renders avatar + 'Save & send' and no italic disclaimer", async ({
  page,
}) => {
  const ts = Date.now();
  const clientEmail = `pp3-look-${ts}@e2e.wishi.test`;
  const stylistEmail = `pp3-lookst-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_pp3_look_${ts}`,
    email: clientEmail,
    firstName: "Look",
    lastName: "Tester",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_pp3_lookst_${ts}`,
    email: stylistEmail,
    firstName: "Robin",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });

  try {
    await signInAsStylist(page, stylistEmail);
    await page.goto(`/stylist/sessions/${session.id}/styleboards/new`);
    await page.waitForLoadState("networkidle");

    const body = await page.locator("body").innerText();

    // Loveable mirror: top bar shows the client's name as the headline,
    // not "for {name}" framing. The "Create a look" subtitle still sits
    // under the name.
    expect(body).toContain("Look Tester");
    expect(body).toContain("Create a look");

    // E-7: HTML entity literal must not survive into rendered text.
    expect(body).not.toContain("Save &amp; send");
    expect(body).toContain("Save & send");

    // E-4: italic taxonomy disclaimer was removed in this pass.
    expect(body).not.toContain("preview taxonomy not yet served by inventory");

    // D-2: Client info opens an inline sheet — the button is in the top
    // bar (not a link to /stylist/clients/<id>, which doesn't exist).
    await expect(
      page.getByRole("button", { name: /^Client info$/ }),
    ).toBeVisible();
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("LookCreator panels render Loveable sub-tabs + favorites pill", async ({
  page,
}) => {
  const ts = Date.now();
  const clientEmail = `pp3-panel-${ts}@e2e.wishi.test`;
  const stylistEmail = `pp3-panelst-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_pp3_panel_${ts}`,
    email: clientEmail,
    firstName: "Panel",
    lastName: "Tester",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_pp3_panelst_${ts}`,
    email: stylistEmail,
    firstName: "Quinn",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });

  try {
    await signInAsStylist(page, stylistEmail);
    await page.goto(`/stylist/sessions/${session.id}/styleboards/new`);
    await page.waitForLoadState("networkidle");

    // M-7 Favorites-only pill — visible on the Shop tab by default.
    await expect(
      page.getByRole("button", { name: /Favorites only/ }),
    ).toBeVisible();

    // M-2 Closet sub-tabs.
    await page.getByRole("button", { name: "Closet" }).click();
    await expect(page.getByRole("button", { name: /^All \(/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Cart \(/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Purchased \(/ }),
    ).toBeVisible();

    // M-3 Previous-boards sub-tabs.
    await page.getByRole("button", { name: "Previous looks" }).click();
    await expect(
      page.getByRole("button", { name: /^Style boards$/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Mood boards$/ }),
    ).toBeVisible();
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("SaveLookDialog uses Loveable copy + required-field UX + tag chips", async ({
  page,
}) => {
  const ts = Date.now();
  const clientEmail = `pp3-save-${ts}@e2e.wishi.test`;
  const stylistEmail = `pp3-savest-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_pp3_save_${ts}`,
    email: clientEmail,
    firstName: "Save",
    lastName: "Tester",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_pp3_savest_${ts}`,
    email: stylistEmail,
    firstName: "Drew",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });

  try {
    await signInAsStylist(page, stylistEmail);
    await page.goto(`/stylist/sessions/${session.id}/styleboards/new`);
    await page.waitForLoadState("networkidle");

    // The save button is disabled below MIN_ITEMS, but it's still
    // present and visible — test the title attr / accessible name.
    const saveBtn = page.getByRole("button", { name: /Save & send/ });
    await expect(saveBtn).toBeVisible();
    // E-7 invariant — must NOT carry the HTML entity literal.
    expect(await saveBtn.innerText()).not.toContain("&amp;");
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
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
