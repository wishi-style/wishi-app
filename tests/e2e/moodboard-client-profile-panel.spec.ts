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
 * Pins the Client Profile panel parity between dashboard and the moodboard +
 * styleboard builders. Before this fix the moodboard / styleboard "Client info"
 * trigger opened a Sheet that read "No client profile available" because the
 * builder didn't pass the `clientId` prop into ClientDetailPanel — the panel
 * only had `sessionId`, which falls back to the (now mostly empty) mock map.
 *
 * The contract this spec asserts:
 *  - Both surfaces use the same trigger label ("Client Profile") so a stylist
 *    can find the panel without learning two different vocabularies.
 *  - Opening the panel from the moodboard builder loads the real profile via
 *    /api/stylist/clients/[clientId]/profile, not the empty-state placeholder.
 */

test.afterAll(async () => {
  await disconnectTestDb();
});

test("moodboard builder Client Profile panel loads real client data", async ({
  page,
}) => {
  const ts = Date.now();
  const clientEmail = `mb-panel-client-${ts}@e2e.wishi.test`;
  const stylistEmail = `mb-panel-stylist-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_mb_panel_c_${ts}`,
    email: clientEmail,
    firstName: "Reagan",
    lastName: "Park",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_mb_panel_s_${ts}`,
    email: stylistEmail,
    firstName: "Sasha",
    lastName: "Madone",
  });
  await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });

  try {
    await page.goto("/sign-in?e2e=1");
    await page.getByLabel("Email").fill(stylistEmail);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).not.toHaveURL(/\/sign-in/);

    await page.goto(`/stylist/sessions/${session.id}/moodboards/new`);
    await page.waitForLoadState("networkidle");

    // Trigger uses the normalized label.
    const trigger = page.getByRole("button", { name: /Client Profile/i });
    await expect(trigger).toBeVisible();
    await trigger.click();

    // Sheet renders the real profile — NOT the "No client profile available"
    // empty state. We assert on the client's real first name to prove the
    // panel resolved the clientId-driven API path.
    await expect(page.getByText("No client profile available")).toHaveCount(0);
    await expect(page.getByText(/Reagan/)).toBeVisible();
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("dashboard Details button uses the same Client Profile label", async ({
  page,
}) => {
  const ts = Date.now();
  const clientEmail = `dash-panel-client-${ts}@e2e.wishi.test`;
  const stylistEmail = `dash-panel-stylist-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_dash_panel_c_${ts}`,
    email: clientEmail,
    firstName: "Reagan",
    lastName: "Park",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_dash_panel_s_${ts}`,
    email: stylistEmail,
    firstName: "Sasha",
    lastName: "Madone",
  });
  await ensureStylistProfile({ userId: stylist.id });
  await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });

  try {
    await page.goto("/sign-in?e2e=1");
    await page.getByLabel("Email").fill(stylistEmail);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).not.toHaveURL(/\/sign-in/);

    await page.goto("/stylist/dashboard");
    await page.waitForLoadState("networkidle");

    // The dashboard's right-pane header carries the same trigger label as the
    // moodboard / styleboard builders, so a stylist learns one vocabulary.
    await expect(
      page.getByRole("button", { name: /Client Profile/i }),
    ).toBeVisible();
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
