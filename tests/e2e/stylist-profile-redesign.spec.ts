import { expect, test } from "@playwright/test";
import {
  ensureStylistUser,
  ensureStylistProfile,
  cleanupStylistProfile,
  cleanupE2EUserByEmail,
  getPool,
} from "./db";

/**
 * StylistProfile post-Phase-10 design refresh:
 *   - hero with stylist name + Continue CTA
 *   - "Meet [Name]" two-column section sourced from bio/philosophy
 *   - Trust band ("A styling experience built on trust" + 4 cards)
 *   - sticky bottom CTA bar (second Continue CTA, always visible)
 *
 * Public route, no sign-in required. Seeds a stylist via the e2e helpers
 * and stamps a couple of bio/philosophy strings via raw SQL because the
 * helper omits them by default.
 */

test("/stylists/[id] renders the post-refresh shell (hero + Meet + Trust + sticky CTA)", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const stylistEmail = `sp-redesign-stylist-${stamp}@e2e.wishi.test`;

  const stylist = await ensureStylistUser({
    clerkId: `e2e_sp_redesign_${stamp}`,
    email: stylistEmail,
    firstName: "Loren",
    lastName: "Profile",
  });
  const profile = await ensureStylistProfile({
    userId: stylist.id,
    styleSpecialties: ["minimalist", "elevated basics"],
  });

  await getPool().query(
    `UPDATE stylist_profiles
     SET bio = $2, philosophy = $3, director_pick = $4, average_rating = $5, instagram_handle = $6
     WHERE id = $1`,
    [
      profile.id,
      "I help people build wardrobes that feel grounded and intentional.",
      "Style is the intersection of comfort and confidence.",
      "A linen blazer that wears day-to-night.",
      4.9,
      `loren_${stamp.slice(-6)}`,
    ],
  );

  try {
    await page.goto(`/stylists/${profile.id}`);
    await page.waitForLoadState("networkidle");

    // Hero: name + a Continue CTA bound to /bookings/new?stylistId=...
    await expect(
      page.getByRole("heading", { level: 1, name: "Loren Profile" }),
    ).toBeVisible();
    const heroCta = page
      .getByRole("link", { name: /Continue with Loren/i })
      .first();
    await expect(heroCta).toBeVisible();
    await expect(heroCta).toHaveAttribute(
      "href",
      `/bookings/new?stylistId=${profile.id}`,
    );

    // Meet section uses the bio and philosophy strings we stamped.
    // Labels in the section apply text-transform: uppercase, so innerText
    // returns them in uppercase — assert case-insensitively.
    await expect(page.getByRole("heading", { name: "Meet Loren" })).toBeVisible();
    const lowered = (await page.locator("body").innerText()).toLowerCase();
    expect(lowered).toContain("my approach");
    expect(lowered).toContain("style philosophy");
    expect(lowered).toContain("director");
    expect(lowered).toContain("intersection of comfort");

    // Trust band
    await expect(
      page.getByRole("heading", { name: /A styling experience built on trust/i }),
    ).toBeVisible();
    expect(lowered).toContain("use any brand");
    expect(lowered).toContain("no commissions");
    expect(lowered).toContain("switch anytime");
    expect(lowered).toContain("shop your closet");

    // Sticky bottom CTA: there should be at least 2 Continue links
    // (one in the hero, one in the sticky bar).
    const ctaCount = await page
      .getByRole("link", { name: /Continue with Loren/i })
      .count();
    expect(ctaCount).toBeGreaterThanOrEqual(2);
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("/stylists/[id] for an unavailable stylist swaps Continue for Waitlist in both CTA slots", async ({
  page,
}) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const stylistEmail = `sp-redesign-waitlist-${stamp}@e2e.wishi.test`;

  const stylist = await ensureStylistUser({
    clerkId: `e2e_sp_waitlist_${stamp}`,
    email: stylistEmail,
    firstName: "Reese",
    lastName: "Booked",
  });
  const profile = await ensureStylistProfile({
    userId: stylist.id,
    isAvailable: false,
  });

  try {
    await page.goto(`/stylists/${profile.id}`);
    await page.waitForLoadState("networkidle");

    // No Continue CTA at all (both slots show waitlist instead)
    await expect(
      page.getByRole("link", { name: /Continue with Reese/i }),
    ).toHaveCount(0);

    const joinButtons = page.getByRole("button", { name: /Join Waitlist/i });
    expect(await joinButtons.count()).toBeGreaterThanOrEqual(2);

    // The "currently unavailable" copy block surfaces in the hero
    const body = await page.locator("body").innerText();
    expect(body).toContain("currently unavailable");
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
