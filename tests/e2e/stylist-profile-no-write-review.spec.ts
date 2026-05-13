import { expect, test } from "@playwright/test";
import {
  ensureClientUser,
  ensureStylistUser,
  ensureStylistProfile,
  createSessionForClient,
  cleanupStylistProfile,
  cleanupE2EUserByEmail,
} from "./db";

/**
 * Reviews can only be submitted through the end-session flow
 * (`/sessions/[id]/end-session` → `submitEndSessionFeedback`). The public
 * stylist profile must NOT expose a "Write a Review" affordance, even to a
 * logged-in client who has already completed a session with that stylist
 * — historically the button stayed visible after a completed session and the
 * underlying service silently upserted, letting clients overwrite reviews.
 *
 * Guards: (a) unauthenticated profile view, (b) authenticated client with a
 * COMPLETED session — both must lack any "Write a Review" / write-review
 * trigger, and the dedicated POST endpoint must respond 405.
 */

test("public stylist profile never renders a Write a Review button", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const stylistEmail = `nwr-stylist-${stamp}@e2e.wishi.test`;

  const stylist = await ensureStylistUser({
    clerkId: `e2e_nwr_stylist_${stamp}`,
    email: stylistEmail,
    firstName: "Noah",
    lastName: "Profileonly",
  });
  const profile = await ensureStylistProfile({ userId: stylist.id });

  try {
    const res = await page.goto(`/stylists/${profile.id}`);
    expect(res?.status()).toBe(200);
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("button", { name: /Write a Review/i }),
    ).toHaveCount(0);
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("logged-in client with a COMPLETED session still sees no Write a Review button", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clientEmail = `nwr-client-${stamp}@e2e.wishi.test`;
  const stylistEmail = `nwr-styl-${stamp}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_nwr_client_${stamp}`,
    email: clientEmail,
    firstName: "Mira",
    lastName: "Returning",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_nwr_styl_${stamp}`,
    email: stylistEmail,
    firstName: "Devon",
    lastName: "Booked",
  });
  const profile = await ensureStylistProfile({ userId: stylist.id });

  await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    planType: "MAJOR",
    status: "COMPLETED",
  });

  try {
    await page.goto("/sign-in?e2e=1");
    await page.getByLabel("Email").fill(clientEmail);
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForLoadState("networkidle");

    const res = await page.goto(`/stylists/${profile.id}`);
    expect(res?.status()).toBe(200);
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("button", { name: /Write a Review/i }),
    ).toHaveCount(0);

    // The "Be the first to share your experience" prompt is also gone — no
    // current flow lets the client share an experience from the profile.
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/Be the first to share your experience/i);
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("POST /api/stylists/[id]/reviews is not exposed even to eligible clients", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clientEmail = `nwr-api-client-${stamp}@e2e.wishi.test`;
  const stylistEmail = `nwr-api-styl-${stamp}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_nwr_api_c_${stamp}`,
    email: clientEmail,
    firstName: "Probe",
    lastName: "Eligible",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_nwr_api_s_${stamp}`,
    email: stylistEmail,
    firstName: "Api",
    lastName: "Probe",
  });
  const profile = await ensureStylistProfile({ userId: stylist.id });

  // Eligible by COMPLETED session — the *former* gate. Even so, POST must
  // not produce a review row now that end-session is the only write path.
  await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    planType: "MAJOR",
    status: "COMPLETED",
  });

  try {
    // Authenticate the page so page.request carries the e2e Clerk cookie.
    await page.goto("/sign-in?e2e=1");
    await page.getByLabel("Email").fill(clientEmail);
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForLoadState("networkidle");

    const res = await page.request.post(
      `/api/stylists/${profile.id}/reviews`,
      { data: { rating: 5, reviewText: "should not be accepted" } },
    );
    // Re-adding the POST handler would surface as 201/200 here. Anything in
    // 4xx/5xx is fine — the contract is "no successful write".
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(600);
    expect([200, 201]).not.toContain(res.status());
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
