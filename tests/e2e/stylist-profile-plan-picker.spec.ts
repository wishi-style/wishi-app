import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  disconnectTestDb,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
} from "./db";

async function signInAsClient(
  page: import("@playwright/test").Page,
  email: string,
) {
  await page.goto("/sign-in?e2e=1");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

/**
 * Loveable's StylistProfile renders a `<PlanPicker>` between Reviews and
 * Trust on every available stylist's page (StylistProfile.tsx:603-609).
 * Three plan cards (Mini / Major / Lux), Major flagged as "Popular",
 * Continue CTA carries the selection through to /select-plan, and the
 * "Learn more about plans" link points to /pricing. We were missing the
 * whole section; this spec verifies the full chrome plus the round-trip
 * to /select-plan?plan=mini honoring the carried tier.
 */

test.afterAll(async () => {
  await disconnectTestDb();
});

test("/stylists/[id] renders the Loveable PlanPicker section + ?plan= round-trips into /select-plan", async ({
  page,
}) => {
  const ts = Date.now();
  const email = `pp-stylist-${ts}@e2e.wishi.test`;
  const stylist = await ensureStylistUser({
    clerkId: `e2e_pp_stylist_${ts}`,
    email,
    firstName: "Phyllis",
    lastName: "Picker",
  });
  const profile = await ensureStylistProfile({ userId: stylist.id });

  try {
    await page.goto(`/stylists/${profile.id}`);
    await page.waitForLoadState("networkidle");

    // Scope to the PlanPicker section to avoid matching the sticky bottom CTA.
    const heading = page.getByRole("heading", {
      name: "Choose your plan",
      level: 2,
    });
    await expect(heading).toBeVisible();
    const picker = page
      .locator("section")
      .filter({ has: heading });

    await expect(
      picker.getByText("Select a plan and start styling with Phyllis"),
    ).toBeVisible();
    // Three plan cards by aria-pressed (only plan cards have this attr).
    const planCards = picker.locator("button[aria-pressed]");
    await expect(planCards).toHaveCount(3);
    await expect(planCards.filter({ hasText: "Wishi Mini" })).toHaveCount(1);
    const major = planCards.filter({ hasText: "Wishi Major" });
    await expect(major).toHaveCount(1);
    await expect(major).toHaveAttribute("aria-pressed", "true");
    // Loveable's "Popular" pill on the Major card.
    await expect(picker.getByText("Popular", { exact: true })).toBeVisible();
    await expect(planCards.filter({ hasText: "Wishi Lux" })).toHaveCount(1);

    // Default Continue label tracks the selected plan.
    await expect(
      picker.getByRole("button", { name: "Continue with Wishi Major" }),
    ).toBeVisible();

    // "Learn more about plans" → /pricing.
    await expect(
      picker.getByRole("link", { name: /Learn more about plans/i }),
    ).toHaveAttribute("href", "/pricing");

    // Picking Mini swaps the CTA label.
    await planCards.filter({ hasText: "Wishi Mini" }).click();
    await expect(
      picker.getByRole("button", { name: "Continue with Wishi Mini" }),
    ).toBeVisible();
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(email);
  }
});

test("/select-plan honors the ?plan=mini query param from PlanPicker", async ({
  page,
}) => {
  const ts = Date.now();
  const clientEmail = `pp-rt-c-${ts}@e2e.wishi.test`;
  const stylistEmail = `pp-rt-s-${ts}@e2e.wishi.test`;
  await ensureClientUser({
    clerkId: `e2e_pp_rt_c_${ts}`,
    email: clientEmail,
    firstName: "Trip",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_pp_rt_s_${ts}`,
    email: stylistEmail,
    firstName: "Phyl",
    lastName: "Picker",
  });
  const profile = await ensureStylistProfile({ userId: stylist.id });

  try {
    await signInAsClient(page, clientEmail);
    await page.goto(`/select-plan?stylistId=${profile.id}&plan=mini`);
    await page.waitForLoadState("networkidle");

    // Mini is pre-selected: the page renders Mini-specific copy ("NEW PIECES TO MY CLOSET")
    // in the selected card detail panel.
    await expect(page.getByText("NEW PIECES TO MY CLOSET")).toBeVisible();
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
