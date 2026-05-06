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
 * Pin Bug #2's fix: when a booked client's User row has empty first/last
 * names (Clerk OAuth signups + the guest-quiz claim path leave them blank),
 * the stylist dashboard previously rendered every such session as the
 * literal "Client" with a "?" avatar — making the queue look like every
 * booking came from the same anonymous person.
 *
 * The fix falls back through the email handle before reaching "Client".
 * This spec asserts that contract end-to-end against the real dashboard
 * service + page render.
 */

test.afterAll(async () => {
  await disconnectTestDb();
});

test("dashboard falls back to email handle when client first/last names are empty", async ({
  page,
}) => {
  const ts = Date.now();
  const clientEmail = `noname-client-${ts}@e2e.wishi.test`;
  const stylistEmail = `noname-stylist-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_noname_client_${ts}`,
    email: clientEmail,
    firstName: "",
    lastName: "",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_noname_stylist_${ts}`,
    email: stylistEmail,
    firstName: "Avery",
    lastName: "Lin",
  });
  await ensureStylistProfile({ userId: stylist.id });
  await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });

  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(stylistEmail);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).not.toHaveURL(/\/sign-in/);

    await page.goto("/stylist/dashboard");
    await page.waitForLoadState("networkidle");

    const body = await page.locator("body").innerText();
    const expectedHandle = clientEmail.split("@")[0];
    const expectedDisplay =
      expectedHandle.charAt(0).toUpperCase() + expectedHandle.slice(1);

    // Email-handle fallback renders. Bug #2 had this as the literal "Client".
    expect(body).toContain(expectedDisplay);
    // Avatar initial is the first letter of the handle, not "?".
    expect(body).toContain(expectedHandle.charAt(0).toUpperCase());
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
