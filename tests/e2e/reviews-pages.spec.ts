import { expect, test } from "@playwright/test";
import {
  ensureClientUser,
  ensureStylistUser,
  ensureStylistProfile,
  createSessionForClient,
  cleanupStylistProfile,
  cleanupE2EUserByEmail,
  getPool,
} from "./db";

/**
 * Wave C: public /reviews + per-stylist /stylists/[id]/reviews.
 * No access model decisions needed — both pages read from the existing
 * review service and are pure frontend adds.
 *
 * The spec seeds a stylist + client + COMPLETED session, then stamps
 * rating + review_text via raw SQL so the session surfaces in both the
 * cross-stylist /reviews masonry and the per-stylist list.
 */

test("/reviews renders a seeded session review with stylist attribution", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clientEmail = `reviews-client-${stamp}@e2e.wishi.test`;
  const stylistEmail = `reviews-stylist-${stamp}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_rv_client_${stamp}`,
    email: clientEmail,
    firstName: "Taye",
    lastName: "Bloom",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_rv_stylist_${stamp}`,
    email: stylistEmail,
    firstName: "Imara",
    lastName: "Reviewed",
  });
  await ensureStylistProfile({ userId: stylist.id });

  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    planType: "MAJOR",
    status: "COMPLETED",
  });

  const uniqueReviewText = `Imara absolutely transformed my closet (${stamp}).`;
  await getPool().query(
    `UPDATE sessions
     SET rating = 5, review_text = $2, rated_at = NOW(), completed_at = NOW()
     WHERE id = $1`,
    [session.id, uniqueReviewText],
  );

  try {
    const res = await page.goto("/reviews");
    expect(res?.status()).toBe(200);
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", { level: 1, name: /Our clients tell it how it is/i }),
    ).toBeVisible();

    // The seeded review surfaces with the stylist's first-name attribution.
    // Stamp is in the review text so we never collide with prior/peer runs.
    const body = await page.locator("body").innerText();
    expect(body).toContain(uniqueReviewText);
    expect(body).toContain("Styled by Imara");
    expect(body).toContain("Taye B.");
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("/reviews exposes Loveable's Read more / Show less toggle on long quotes", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clientEmail = `rv-long-client-${stamp}@e2e.wishi.test`;
  const stylistEmail = `rv-long-stylist-${stamp}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_rv_long_c_${stamp}`,
    email: clientEmail,
    firstName: "Quinn",
    lastName: "LongRead",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_rv_long_s_${stamp}`,
    email: stylistEmail,
    firstName: "Kai",
    lastName: "LongQuoter",
  });
  await ensureStylistProfile({ userId: stylist.id });

  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    planType: "MAJOR",
    status: "COMPLETED",
  });

  // > 120 chars triggers Loveable's clamp + button
  const longText =
    `${stamp} — working with Kai genuinely changed how I think about getting dressed. ` +
    `Every look was thoughtful, the fit was perfect, and they took the time to explain ` +
    `the why behind every piece. Truly the best investment I've made for myself this year.`;

  await getPool().query(
    `UPDATE sessions
     SET rating = 5, review_text = $2, rated_at = NOW(), completed_at = NOW()
     WHERE id = $1`,
    [session.id, longText],
  );

  try {
    await page.goto("/reviews");
    await page.waitForLoadState("networkidle");

    const readMore = page.getByRole("button", { name: "Read more" }).first();
    await expect(readMore).toBeVisible();

    await readMore.click();
    await expect(
      page.getByRole("button", { name: "Show less" }).first(),
    ).toBeVisible();
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("/stylists/[id]/reviews renders the dedicated review list and back link", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clientEmail = `stylrv-client-${stamp}@e2e.wishi.test`;
  const stylistEmail = `stylrv-stylist-${stamp}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_stylrv_client_${stamp}`,
    email: clientEmail,
    firstName: "Jules",
    lastName: "Reader",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_stylrv_stylist_${stamp}`,
    email: stylistEmail,
    firstName: "Selene",
    lastName: "Rated",
  });
  const profile = await ensureStylistProfile({ userId: stylist.id });

  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    planType: "MAJOR",
    status: "COMPLETED",
  });

  const reviewText = `Selene gave me a fresh start on my winter wardrobe (${stamp}).`;
  await getPool().query(
    `UPDATE sessions
     SET rating = 5, review_text = $2, rated_at = NOW(), completed_at = NOW()
     WHERE id = $1`,
    [session.id, reviewText],
  );

  try {
    const res = await page.goto(`/stylists/${profile.id}/reviews`);
    expect(res?.status()).toBe(200);
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", { level: 1, name: /What Selene.s clients say/i }),
    ).toBeVisible();

    // Back link points at the stylist profile
    const backLink = page.getByRole("link", {
      name: /Back to Selene.s profile/i,
    });
    await expect(backLink).toHaveAttribute("href", `/stylists/${profile.id}`);

    const body = await page.locator("body").innerText();
    expect(body).toContain(reviewText);
    expect(body).toContain("Jules R.");
    expect(body).toContain("1 Review");
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
