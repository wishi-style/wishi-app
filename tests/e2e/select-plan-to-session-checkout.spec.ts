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
 * Loveable's funnel goes /select-plan → /session-checkout → Stripe Hosted.
 * The "Continue with Wishi …" CTA on /select-plan must navigate to
 * /session-checkout?plan=<lower>&stylistId=<id> (not jump straight to
 * Stripe), so the Loveable in-app summary + frequency toggle + promo
 * field are reachable. The "Pay" button on /session-checkout is what
 * triggers the createCheckout server action and Stripe redirect.
 */

test.afterAll(async () => {
  await disconnectTestDb();
});

test("/select-plan Continue routes to /session-checkout carrying plan + stylistId", async ({
  page,
}) => {
  const ts = Date.now();
  const clientEmail = `sp-sc-c-${ts}@e2e.wishi.test`;
  const stylistEmail = `sp-sc-s-${ts}@e2e.wishi.test`;
  await ensureClientUser({
    clerkId: `e2e_sp_sc_c_${ts}`,
    email: clientEmail,
    firstName: "Selena",
    lastName: "Plan",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_sp_sc_s_${ts}`,
    email: stylistEmail,
    firstName: "Sasha",
    lastName: "Stylist",
  });
  const profile = await ensureStylistProfile({ userId: stylist.id });

  try {
    await signInAsClient(page, clientEmail);
    // ?plan=mini pre-selects the Mini card (round-trip already covered by
    // stylist-profile-plan-picker.spec). We use it here so the spec proves
    // the Continue href tracks the *selected* plan, not just Major.
    await page.goto(`/select-plan?stylistId=${profile.id}&plan=mini`);
    await page.waitForLoadState("networkidle");

    const cta = page
      .getByRole("link", { name: "Continue with Wishi Mini" })
      .first();
    await expect(cta).toHaveAttribute(
      "href",
      `/session-checkout?plan=mini&stylistId=${profile.id}`,
    );

    await cta.click();
    await expect(page).toHaveURL(
      new RegExp(
        `/session-checkout\\?plan=mini&stylistId=${profile.id}$`,
      ),
    );

    // Loveable SessionCheckout chrome renders — "Pay Wishi Fashion, Inc.",
    // contact-info section, and the Stripe pay CTA.
    await expect(page.getByText("Pay Wishi Fashion, Inc.")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Contact information" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^Pay \$/ })).toBeVisible();
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
