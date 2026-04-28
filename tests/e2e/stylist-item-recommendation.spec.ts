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

/**
 * D9 — wires the stylist Dashboard "Send item recommendation" form to
 * `POST /api/sessions/[id]/messages` with `kind=SINGLE_ITEM`. Today the
 * form was local-state-only; this spec proves the contract checks on the
 * extended endpoint.
 *
 * Live Twilio mirroring of the SINGLE_ITEM message kind is covered by the
 * existing `tests/e2e/chat.spec.ts` (which depends on real Twilio + ngrok).
 * This spec stays env-free by asserting on validation responses before the
 * Twilio call would fire.
 */

test.afterAll(async () => {
  await disconnectTestDb();
});

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/(stylist|sessions|onboarding|matches|welcome)/);
}

test("only stylists can send SINGLE_ITEM messages; clients are 403'd", async ({ page }) => {
  const ts = Date.now();
  const clientEmail = `d9-c-${ts}@e2e.wishi.test`;
  const stylistEmail = `d9-s-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_d9_c_${ts}`,
    email: clientEmail,
    firstName: "Client",
    lastName: "Reco",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_d9_s_${ts}`,
    email: stylistEmail,
    firstName: "Stylist",
    lastName: "Reco",
  });
  await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });
  // Endpoint short-circuits with 400 "No chat channel" when twilio_channel_sid
  // is null. Stamp a placeholder so the role + payload validations actually run.
  await getPool().query(
    `UPDATE sessions SET twilio_channel_sid = $1 WHERE id = $2`,
    [`CH_e2e_d9_${ts}`, session.id],
  );

  try {
    // Client signs in and tries to send a SINGLE_ITEM — 403.
    await signIn(page, clientEmail);
    const clientRes = await page.request.post(
      `/api/sessions/${session.id}/messages`,
      {
        data: {
          kind: "SINGLE_ITEM",
          webUrl: "https://example.com/product",
          body: "trying to recommend",
        },
      },
    );
    expect(clientRes.status()).toBe(403);
    const clientBody = (await clientRes.json()) as { error?: string };
    expect(clientBody.error).toMatch(/stylists/i);
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("SINGLE_ITEM rejects missing url and invalid url", async ({ page }) => {
  const ts = Date.now() + 1;
  const clientEmail = `d9-vc-${ts}@e2e.wishi.test`;
  const stylistEmail = `d9-vs-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_d9_vc_${ts}`,
    email: clientEmail,
    firstName: "Validate",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_d9_vs_${ts}`,
    email: stylistEmail,
    firstName: "Validate",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });
  await getPool().query(
    `UPDATE sessions SET twilio_channel_sid = $1 WHERE id = $2`,
    [`CH_e2e_d9_v_${ts}`, session.id],
  );

  try {
    await signIn(page, stylistEmail);

    // Missing both webUrl and inventoryProductId — 400.
    const missing = await page.request.post(
      `/api/sessions/${session.id}/messages`,
      { data: { kind: "SINGLE_ITEM", body: "no link attached" } },
    );
    expect(missing.status()).toBe(400);
    const missingBody = (await missing.json()) as { error?: string };
    expect(missingBody.error).toMatch(/webUrl|inventoryProductId/i);

    // Invalid webUrl shape — 400 before any Twilio call fires.
    const bad = await page.request.post(
      `/api/sessions/${session.id}/messages`,
      { data: { kind: "SINGLE_ITEM", webUrl: "not a url", body: "x" } },
    );
    expect(bad.status()).toBe(400);
    const badBody = (await bad.json()) as { error?: string };
    expect(badBody.error).toMatch(/Invalid webUrl/i);
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
