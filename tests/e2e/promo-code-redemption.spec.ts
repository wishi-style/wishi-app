import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  disconnectTestDb,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
} from "./db";

/**
 * Promo code redemption on /session-checkout. Asserts:
 *   1. valid AMOUNT code applies and total updates to subtotal − amount
 *   2. valid PERCENT code applies and total updates to subtotal × (1−pct)
 *   3. invalid code surfaces "Code not found" / similar reason text
 *
 * The redemption itself (Stripe coupon attached, usedCount incremented) is
 * proven by tests/webhook-router.test.ts (handleCheckoutCompleted promo
 * redemption) — this spec only proves the UI-layer wiring through the
 * /api/promo-codes/validate endpoint.
 */

async function signInAsClient(
  page: import("@playwright/test").Page,
  email: string,
) {
  await page.goto("/sign-in?e2e=1");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

async function seedPromo(opts: {
  code: string;
  discountType: "AMOUNT" | "PERCENT";
  discountValue: number;
}): Promise<string> {
  const id = `promo_${randomUUID().slice(0, 8)}`;
  await getPool().query(
    `INSERT INTO promo_codes
      (id, code, credit_type, discount_type, discount_value, is_active, used_count, created_at, updated_at)
     VALUES ($1, $2, 'SESSION', $3, $4, true, 0, NOW(), NOW())`,
    [id, opts.code, opts.discountType, opts.discountValue],
  );
  return id;
}

async function deletePromo(id: string) {
  await getPool().query(`DELETE FROM promo_codes WHERE id = $1`, [id]);
}

test.afterAll(async () => {
  await disconnectTestDb();
});

test("AMOUNT promo code subtracts dollars from total on /session-checkout", async ({ page }) => {
  const ts = Date.now();
  const clientEmail = `promo-amt-${ts}@e2e.wishi.test`;
  const stylistEmail = `promo-amt-s-${ts}@e2e.wishi.test`;
  const code = `AMT${ts}`;

  await ensureClientUser({
    clerkId: `e2e_promo_amt_c_${ts}`,
    email: clientEmail,
    firstName: "Promo",
    lastName: "Amount",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_promo_amt_s_${ts}`,
    email: stylistEmail,
    firstName: "Sasha",
    lastName: "Stylist",
  });
  const profile = await ensureStylistProfile({ userId: stylist.id });
  const promoId = await seedPromo({
    code,
    discountType: "AMOUNT",
    discountValue: 2500, // $25 off
  });

  try {
    await signInAsClient(page, clientEmail);
    // Mini is $60. $25 off → $35 total.
    await page.goto(`/session-checkout?plan=mini&stylistId=${profile.id}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("button", { name: /^Pay \$60$/ })).toBeVisible();

    await page.getByRole("button", { name: "Add promotion code" }).click();
    await page.getByPlaceholder("Promo code").fill(code);
    await page.getByRole("button", { name: "Apply" }).click();

    await expect(page.getByText(/\$25 off applied/i)).toBeVisible();
    await expect(page.getByText("−$25")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Pay \$35$/ })).toBeVisible();
  } finally {
    await deletePromo(promoId);
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("PERCENT promo code applies percentage to total on /session-checkout", async ({ page }) => {
  const ts = Date.now();
  const clientEmail = `promo-pct-${ts}@e2e.wishi.test`;
  const stylistEmail = `promo-pct-s-${ts}@e2e.wishi.test`;
  const code = `PCT${ts}`;

  await ensureClientUser({
    clerkId: `e2e_promo_pct_c_${ts}`,
    email: clientEmail,
    firstName: "Promo",
    lastName: "Percent",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_promo_pct_s_${ts}`,
    email: stylistEmail,
    firstName: "Sasha",
    lastName: "Stylist",
  });
  const profile = await ensureStylistProfile({ userId: stylist.id });
  const promoId = await seedPromo({
    code,
    discountType: "PERCENT",
    discountValue: 50, // 50% off
  });

  try {
    await signInAsClient(page, clientEmail);
    // Mini is $60. 50% off → $30 total.
    await page.goto(`/session-checkout?plan=mini&stylistId=${profile.id}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Add promotion code" }).click();
    await page.getByPlaceholder("Promo code").fill(code);
    await page.getByRole("button", { name: "Apply" }).click();

    await expect(page.getByText(/50% off applied/i)).toBeVisible();
    await expect(page.getByText("−$30")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Pay \$30$/ })).toBeVisible();
  } finally {
    await deletePromo(promoId);
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("PERCENT code with non-whole-dollar discount renders cents accurately", async ({ page }) => {
  const ts = Date.now();
  const clientEmail = `promo-pct-cents-${ts}@e2e.wishi.test`;
  const stylistEmail = `promo-pct-cents-s-${ts}@e2e.wishi.test`;
  const code = `PCTCENTS${ts}`;

  await ensureClientUser({
    clerkId: `e2e_promo_pctc_c_${ts}`,
    email: clientEmail,
    firstName: "Promo",
    lastName: "Cents",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_promo_pctc_s_${ts}`,
    email: stylistEmail,
    firstName: "Sasha",
    lastName: "Stylist",
  });
  const profile = await ensureStylistProfile({ userId: stylist.id });
  const promoId = await seedPromo({
    code,
    discountType: "PERCENT",
    discountValue: 33, // 33% off $60 = $19.80 discount → $40.20 total (non-whole)
  });

  try {
    await signInAsClient(page, clientEmail);
    await page.goto(`/session-checkout?plan=mini&stylistId=${profile.id}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Add promotion code" }).click();
    await page.getByPlaceholder("Promo code").fill(code);
    await page.getByRole("button", { name: "Apply" }).click();

    // Discount line shows $19.80 with two decimals, NOT a rounded $20.
    await expect(page.getByText("−$19.80")).toBeVisible();
    // Pay CTA shows the matching $40.20 so it agrees with what Stripe charges.
    await expect(page.getByRole("button", { name: /^Pay \$40\.20$/ })).toBeVisible();
  } finally {
    await deletePromo(promoId);
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("Invalid promo code surfaces a rejection message", async ({ page }) => {
  const ts = Date.now();
  const clientEmail = `promo-bad-${ts}@e2e.wishi.test`;
  const stylistEmail = `promo-bad-s-${ts}@e2e.wishi.test`;

  await ensureClientUser({
    clerkId: `e2e_promo_bad_c_${ts}`,
    email: clientEmail,
    firstName: "Promo",
    lastName: "Bad",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_promo_bad_s_${ts}`,
    email: stylistEmail,
    firstName: "Sasha",
    lastName: "Stylist",
  });
  const profile = await ensureStylistProfile({ userId: stylist.id });

  try {
    await signInAsClient(page, clientEmail);
    await page.goto(`/session-checkout?plan=mini&stylistId=${profile.id}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Add promotion code" }).click();
    await page.getByPlaceholder("Promo code").fill("THISDOESNOTEXIST");
    await page.getByRole("button", { name: "Apply" }).click();

    await expect(page.getByText(/Code not found/i)).toBeVisible();
    // Total stays $60 — no discount applied.
    await expect(page.getByRole("button", { name: /^Pay \$60$/ })).toBeVisible();
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
