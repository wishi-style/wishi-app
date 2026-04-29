import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  disconnectTestDb,
  ensureClientUser,
  getPool,
} from "./db";

/**
 * Live UI walkthrough of the native /checkout flow against real Stripe Tax
 * + Stripe PaymentElement. Requires:
 *   - dev:e2e running on :3001 backed by wishi_p5
 *   - real STRIPE_SECRET_KEY (test mode) + INVENTORY_SERVICE_URL pointing
 *     at the staging tastegraph (default in .env)
 *   - the merchandised inventory id below points at a real in-stock
 *     product (Prada America's Cup Sneakers — verified 2026-04-28)
 *
 * Tagged @live so it can be excluded from PR-CI runs that don't have a
 * real Stripe key. Run with `npx playwright test checkout-elements-live`.
 */

const REAL_INVENTORY_ID = "de9fcf51-3cfb-4fb9-b67d-783bf825d0e0";

test.afterAll(async () => {
  await disconnectTestDb();
});

test("@live full /checkout walkthrough reaches PaymentElement with real Stripe Tax", async ({
  page,
}) => {
  const email = `checkout-live-${Date.now()}@e2e.wishi.test`;
  await cleanupE2EUserByEmail(email);

  const client = await ensureClientUser({
    clerkId: `e2e_checkout_live_${Date.now()}`,
    email,
    firstName: "Checkout",
    lastName: "Live",
  });

  // Seed: merchandised product (idempotent), session, cart item.
  await getPool().query(
    `INSERT INTO merchandised_products
       (id, inventory_product_id, is_direct_sale, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, true, NOW(), NOW())
     ON CONFLICT (inventory_product_id) DO UPDATE SET is_direct_sale = true`,
    [REAL_INVENTORY_ID],
  );

  const sessionRes = await getPool().query(
    `INSERT INTO sessions
       (id, client_id, plan_type, status, amount_paid_in_cents,
        styleboards_allowed, moodboards_allowed, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, 'MAJOR', 'ACTIVE',
             13000, 3, 1, NOW(), NOW())
     RETURNING id`,
    [client.id],
  );
  const sessionId = sessionRes.rows[0].id;

  const cartRes = await getPool().query(
    `INSERT INTO cart_items
       (id, user_id, inventory_product_id, session_id, quantity, added_at)
     VALUES (gen_random_uuid()::text, $1, $2, $3, 1, NOW())
     RETURNING id`,
    [client.id, REAL_INVENTORY_ID, sessionId],
  );
  const cartItemId = cartRes.rows[0].id;

  // Capture browser console errors so a failure shows up as test output
  // rather than a green page that's actually broken.
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => consoleErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  try {
    // Sign in via the E2E backdoor — `?e2e=1` opts into the test-only
    // form (PR #74). Without it, the page renders the Clerk widget which
    // can't be driven headlessly.
    await page.goto("/sign-in?e2e=1");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).not.toHaveURL(/\/sign-in/);

    // Land on /checkout with the seeded cart item.
    await page.goto(`/checkout?items=${cartItemId}`);
    await page.waitForLoadState("networkidle");

    // Step 1: shipping form is rendered (tastegraph resolved the product).
    await expect(page.getByRole("heading", { name: "Shipping Information" }))
      .toBeVisible({ timeout: 15000 });

    // Fill the shipping form. TX state → Stripe Tax computes 8.25% (US sales tax).
    await page.getByLabel("First Name").fill("Live");
    await page.getByLabel("Last Name").fill("Tester");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Street Address").fill("123 Test St");
    await page.getByLabel("City").fill("Austin");
    await page.getByLabel("State").fill("TX");
    await page.getByLabel("ZIP").fill("78701");

    // Continue → calls /api/payments/direct-sale/calculate-tax → real Stripe Tax.
    await page.getByRole("button", { name: /Continue to Payment/i }).click();

    // Step 2: payment step renders with the PaymentElement iframe + Stripe-rendered card form.
    await expect(page.getByRole("heading", { name: "Payment Details" }))
      .toBeVisible({ timeout: 30000 });

    // PaymentElement mounts as an iframe whose src is on stripe.com.
    const stripeFrame = page.frameLocator(
      'iframe[name^="__privateStripeFrame"]',
    );
    await expect(stripeFrame.locator("body")).toBeVisible({ timeout: 20000 });

    // The "Pay $X" label must include a dollar amount — proves Stripe Tax
    // returned and the UI surfaced the total.
    const payButton = page.getByRole("button", { name: /Pay \$[\d,]+\.\d\d/ });
    await expect(payButton).toBeVisible({ timeout: 5000 });

    // Order Summary right rail — assert tax + shipping line items.
    const summary = await page.locator("body").innerText();
    expect(summary).toMatch(/Estimated tax/);
    expect(summary).toMatch(/Subtotal/);
    expect(summary).toMatch(/Total/);

    // No JS / page errors during the flow.
    expect(consoleErrors, `console errors: ${consoleErrors.join(" | ")}`)
      .toHaveLength(0);
  } finally {
    await getPool().query(`DELETE FROM cart_items WHERE id = $1`, [cartItemId]);
    await getPool().query(`DELETE FROM orders WHERE user_id = $1`, [client.id]);
    await getPool().query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
    await cleanupE2EUserByEmail(email);
  }
});
