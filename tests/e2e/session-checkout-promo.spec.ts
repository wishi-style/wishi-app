import { expect, test } from "@playwright/test";
import {
  ensureClientUser,
  ensureStylistUser,
  ensureStylistProfile,
  cleanupStylistProfile,
  cleanupE2EUserByEmail,
} from "./db";
import { prisma } from "@/lib/prisma";

/**
 * Session-checkout promo input — used to be a Loveable mock that compared
 * the typed code to a hardcoded "WISHI" string in local state and never
 * threaded a discount through to Stripe. This spec pins the real flow:
 * POST /api/promo/validate against the PromoCode table, render the canonical
 * code + discount, and surface a friendly error for invalid/expired codes.
 *
 * The Pay button submits to /bookings/new server action, which in E2E auth
 * mode bypasses Stripe entirely — we don't need to exercise the Stripe leg
 * here; the unit tests in `tests/promo-validate.test.ts` cover the
 * validator, and `runCheckout` re-runs the same validator server-side.
 */

const PROMO_CODE = "E2E-PROMO-CHECKOUT";

test.beforeAll(async () => {
  await prisma.promoCode.deleteMany({ where: { code: PROMO_CODE } });
  await prisma.promoCode.create({
    data: {
      code: PROMO_CODE,
      creditType: "SESSION",
      amountInCents: 1000,
      stripeCouponId: "coup_e2e_test",
      isActive: true,
    },
  });
});

test.afterAll(async () => {
  await prisma.promoCode.deleteMany({ where: { code: PROMO_CODE } });
});

test("invalid code surfaces error, valid code renders applied state", async ({
  page,
}) => {
  test.setTimeout(45_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clientEmail = `promo-${stamp}@e2e.wishi.test`;
  const stylistEmail = `promo-styl-${stamp}@e2e.wishi.test`;

  await ensureClientUser({
    clerkId: `e2e_promo_${stamp}`,
    email: clientEmail,
    firstName: "Promo",
    lastName: "Tester",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_promo_styl_${stamp}`,
    email: stylistEmail,
    firstName: "Stylist",
    lastName: "Promo",
  });
  const profile = await ensureStylistProfile({ userId: stylist.id });

  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(clientEmail);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).not.toHaveURL(/\/sign-in/);

    await page.goto(`/session-checkout?plan=major&stylistId=${profile.id}`);
    await page.getByRole("button", { name: /Add promotion code/i }).click();
    const input = page.getByPlaceholder("Promo code");

    // Invalid code — error rendered, no applied chip.
    await input.fill("DEFINITELY-NOT-A-CODE");
    await page.getByRole("button", { name: /^Apply$/ }).click();
    await expect(page.getByText(/Invalid promo code/i)).toBeVisible();

    // Valid code — applied chip + discount line.
    await input.fill(PROMO_CODE);
    await page.getByRole("button", { name: /^Apply$/ }).click();
    await expect(page.getByText(new RegExp(PROMO_CODE, "i"))).toBeVisible();
    await expect(page.getByText(/−\$10/)).toBeVisible();

    // Hidden form field carries the canonical code into createCheckout.
    const hidden = page.locator('form input[type="hidden"][name="promoCode"]');
    await expect(hidden).toHaveValue(PROMO_CODE);
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
