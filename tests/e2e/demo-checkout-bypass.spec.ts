import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  disconnectTestDb,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
} from "./db";

// Proves the E2E/demo checkout bypass introduced in PR#37 actually skips
// Stripe. When E2E_AUTH_MODE=true, submitting /bookings/new must land the
// client directly on /sessions with a BOOKED row — no redirect to
// checkout.stripe.com or billing.wishi.me, and no card-entry step.
//
// Runs against `npm run dev:e2e` (port 3001, E2E_AUTH_MODE=true).

test.afterAll(async () => {
  await disconnectTestDb();
});

async function seedClientAndStylist(testId: string) {
  const clientEmail = `demo-bypass-client-${testId}@e2e.wishi.test`;
  const stylistEmail = `demo-bypass-stylist-${testId}@e2e.wishi.test`;

  await cleanupE2EUserByEmail(clientEmail);
  await cleanupE2EUserByEmail(stylistEmail);

  const client = await ensureClientUser({
    clerkId: `e2e_demo_bypass_client_${testId}`,
    email: clientEmail,
    firstName: "Demo",
    lastName: "BypassClient",
  });

  const stylistUser = await ensureStylistUser({
    clerkId: `e2e_demo_bypass_stylist_${testId}`,
    email: stylistEmail,
    firstName: "Demo",
    lastName: "BypassStylist",
  });

  const stylistProfile = await ensureStylistProfile({ userId: stylistUser.id });

  return { clientEmail, stylistEmail, client, stylistUser, stylistProfile };
}

async function cleanup(
  clientEmail: string,
  stylistEmail: string,
  stylistUserId: string,
) {
  await cleanupStylistProfile(stylistUserId);
  await cleanupE2EUserByEmail(clientEmail);
  await cleanupE2EUserByEmail(stylistEmail);
}

function failOnStripeRedirect(page: import("@playwright/test").Page) {
  page.on("request", (req) => {
    const url = req.url();
    if (
      url.startsWith("https://checkout.stripe.com") ||
      url.startsWith("https://billing.wishi.me")
    ) {
      throw new Error(`E2E bypass failed — hit Stripe-hosted URL: ${url}`);
    }
  });
}

test("demo booking (MINI one-time) skips Stripe and lands on /sessions", async ({
  page,
}) => {
  const testId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const { clientEmail, stylistEmail, client, stylistUser, stylistProfile } =
    await seedClientAndStylist(testId);

  try {
    failOnStripeRedirect(page);

    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(clientEmail);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/(sessions|stylist|match-quiz)/);

    await page.goto(`/bookings/new?stylistId=${stylistProfile.id}`);
    await page.getByRole("button", { name: /^Mini$/ }).click();
    await page.getByRole("button", { name: /Proceed to Checkout/ }).click();

    await page.waitForURL("**/sessions", { timeout: 15_000 });

    const sessionRows = await getPool().query(
      `SELECT id, status, plan_type, stylist_id, stripe_payment_intent_id
         FROM sessions WHERE client_id = $1`,
      [client.id],
    );
    expect(sessionRows.rowCount, "exactly one session created").toBe(1);
    const row = sessionRows.rows[0];
    expect(row.status).toBe("BOOKED");
    expect(row.plan_type).toBe("MINI");
    expect(row.stylist_id).toBe(stylistUser.id);
    expect(
      String(row.stripe_payment_intent_id).startsWith("e2e_pi_"),
      "synthetic payment intent id marked as e2e",
    ).toBe(true);

    const subRows = await getPool().query(
      `SELECT id FROM subscriptions WHERE user_id = $1`,
      [client.id],
    );
    expect(subRows.rowCount, "no subscription for one-time MINI").toBe(0);

    const payRows = await getPool().query(
      `SELECT status, amount_in_cents, stripe_payment_intent_id
         FROM payments WHERE user_id = $1`,
      [client.id],
    );
    expect(payRows.rowCount).toBe(1);
    expect(payRows.rows[0].status).toBe("SUCCEEDED");
    expect(payRows.rows[0].amount_in_cents).toBe(6000);
    expect(
      String(payRows.rows[0].stripe_payment_intent_id).startsWith("e2e_pi_"),
    ).toBe(true);
  } finally {
    await cleanup(clientEmail, stylistEmail, stylistUser.id);
  }
});

test("demo booking (MAJOR subscription) creates TRIALING sub and no Payment row", async ({
  page,
}) => {
  const testId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const { clientEmail, stylistEmail, client, stylistUser, stylistProfile } =
    await seedClientAndStylist(testId);

  try {
    failOnStripeRedirect(page);

    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(clientEmail);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/(sessions|stylist|match-quiz)/);

    await page.goto(`/bookings/new?stylistId=${stylistProfile.id}`);
    await page.getByRole("button", { name: /^Major$/ }).click();

    // PlanSelector renders the subscription toggle only after a plan is
    // selected (and hides it for LUX). It's an unlabelled switch; the
    // 'Subscribe monthly' copy lets us hit the row deterministically.
    await page
      .locator("div", { hasText: "Subscribe monthly" })
      .first()
      .locator('button[type="button"]')
      .first()
      .click();

    await page.getByRole("button", { name: /Start Free Trial/ }).click();
    await page.waitForURL("**/sessions", { timeout: 15_000 });

    const sub = await getPool().query(
      `SELECT status, stripe_subscription_id, stripe_price_id
         FROM subscriptions WHERE user_id = $1`,
      [client.id],
    );
    expect(sub.rowCount, "subscription row created").toBe(1);
    expect(sub.rows[0].status).toBe("TRIALING");
    expect(
      String(sub.rows[0].stripe_subscription_id).startsWith("e2e_sub_"),
    ).toBe(true);

    const session = await getPool().query(
      `SELECT plan_type, status, is_membership, stripe_payment_intent_id
         FROM sessions WHERE client_id = $1`,
      [client.id],
    );
    expect(session.rowCount).toBe(1);
    expect(session.rows[0].plan_type).toBe("MAJOR");
    expect(session.rows[0].is_membership).toBe(true);
    expect(
      session.rows[0].stripe_payment_intent_id,
      "no synthetic PI id for subscription bootstrap",
    ).toBeNull();

    // Regression guard for PR#37 review finding: subscription bootstrap must
    // NOT write a $130 SUCCEEDED Payment row during a free trial, because
    // admin MTD revenue sums payments.status = SUCCEEDED.
    const payments = await getPool().query(
      `SELECT status, amount_in_cents FROM payments WHERE user_id = $1`,
      [client.id],
    );
    expect(
      payments.rowCount,
      "no Payment row for trialing subscription bootstrap",
    ).toBe(0);
  } finally {
    await cleanup(clientEmail, stylistEmail, stylistUser.id);
  }
});
