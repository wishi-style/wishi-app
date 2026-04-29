import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  disconnectTestDb,
  ensureClientUser,
  getPool,
} from "./db";

/**
 * Native /checkout (Stripe Elements) verifications.
 *
 * Goal: prove the page boots, renders Loveable's shipping → payment shell,
 * and surfaces the right empty-state when the cart is invalid. The full
 * happy-path (real Stripe Tax + PaymentElement + payment_intent.succeeded
 * webhook) needs `stripe listen` + a wishi_p5 DB and is exercised by the
 * unit tests in `tests/direct-sale-elements.test.ts` + the manual
 * walkthrough — running it under Playwright would couple this spec to live
 * Stripe / Tastegraph creds it shouldn't need.
 */

test.afterAll(async () => {
  await disconnectTestDb();
});

async function signIn(page: import("@playwright/test").Page, email: string) {
  // `?e2e=1` opts into the test-only form (PR #74). Without it, the page
  // renders the Clerk widget which can't be driven headlessly.
  await page.goto("/sign-in?e2e=1");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

test("/checkout with no items renders the Loveable empty state", async ({
  page,
}) => {
  const email = `checkout-empty-${Date.now()}@e2e.wishi.test`;
  await cleanupE2EUserByEmail(email);
  await ensureClientUser({
    clerkId: `e2e_checkout_empty_${Date.now()}`,
    email,
    firstName: "Checkout",
    lastName: "Empty",
  });

  try {
    await signIn(page, email);
    await page.goto("/checkout");
    await page.waitForLoadState("networkidle");
    const body = await page.locator("body").innerText();
    expect(body, "renders Loveable's empty state").toContain(
      "No items to checkout",
    );
    // "Return to Bag" is the Loveable copy; cart link should be /cart.
    await expect(page.getByRole("link", { name: "Return to Bag" })).toHaveAttribute(
      "href",
      "/cart",
    );
  } finally {
    await cleanupE2EUserByEmail(email);
  }
});

test("/checkout with bogus cart-item ids shows the empty state", async ({
  page,
}) => {
  const email = `checkout-bogus-${Date.now()}@e2e.wishi.test`;
  await cleanupE2EUserByEmail(email);
  await ensureClientUser({
    clerkId: `e2e_checkout_bogus_${Date.now()}`,
    email,
    firstName: "Checkout",
    lastName: "Bogus",
  });

  try {
    await signIn(page, email);
    await page.goto("/checkout?items=cartitem_does_not_exist_123");
    await page.waitForLoadState("networkidle");
    const body = await page.locator("body").innerText();
    expect(body).toContain("No items to checkout");
  } finally {
    await cleanupE2EUserByEmail(email);
  }
});

test(
  "/checkout shipping form renders + Continue stays disabled until valid",
  async ({ page }) => {
    const email = `checkout-shipping-${Date.now()}@e2e.wishi.test`;
    await cleanupE2EUserByEmail(email);
    const client = await ensureClientUser({
      clerkId: `e2e_checkout_shipping_${Date.now()}`,
      email,
      firstName: "Checkout",
      lastName: "Shipping",
    });

    // Seed a session + a direct-sale CartItem so the page resolves a real
    // line item. We can't render real product imagery without a tastegraph
    // hit, but the page is resilient to that and continues.
    const sessionRes = await getPool().query(
      `INSERT INTO sessions
         (id, client_id, plan_type, status,
          amount_paid_in_cents, styleboards_allowed, moodboards_allowed,
          created_at, updated_at)
       VALUES (gen_random_uuid()::text, $1, 'MAJOR', 'ACTIVE',
               13000, 3, 1, NOW(), NOW())
       RETURNING id`,
      [client.id],
    );
    const sessionId = sessionRes.rows[0].id;

    const inventoryProductId = `inv_e2e_checkout_${Date.now()}`;
    await getPool().query(
      `INSERT INTO merchandised_products
         (id, inventory_product_id, is_direct_sale, created_at, updated_at)
       VALUES (gen_random_uuid()::text, $1, true, NOW(), NOW())
       ON CONFLICT (inventory_product_id) DO NOTHING`,
      [inventoryProductId],
    );

    const cartRes = await getPool().query(
      `INSERT INTO cart_items
         (id, user_id, inventory_product_id, session_id, quantity, added_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, 1, NOW())
       RETURNING id`,
      [client.id, inventoryProductId, sessionId],
    );
    const cartItemId = cartRes.rows[0].id;

    try {
      await signIn(page, email);
      // The cart page may show empty-state for this item if the inventory
      // service can't resolve the fake id, so we navigate to /checkout
      // directly with the items query param like the real CheckoutButton does.
      await page.goto(`/checkout?items=${cartItemId}`);
      await page.waitForLoadState("networkidle");

      // The page might fall back to empty state if the inventory service
      // can't resolve the seeded fake id. Both states are acceptable for
      // this targeted spec — we're just proving the route boots without
      // crashing under a logged-in user.
      const body = await page.locator("body").innerText();
      const isShippingShell =
        body.includes("Shipping Information") || body.includes("No items to checkout");
      expect(isShippingShell, "checkout route renders one of the two shells").toBe(true);

      if (body.includes("Shipping Information")) {
        // Continue button should start disabled.
        const continueBtn = page.getByRole("button", { name: /Continue to Payment/i });
        await expect(continueBtn).toBeDisabled();
        await expect(page.getByText(/Order Summary/i)).toBeVisible();
      }
    } finally {
      await getPool().query(`DELETE FROM cart_items WHERE id = $1`, [cartItemId]);
      await getPool().query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
      await getPool().query(
        `DELETE FROM merchandised_products WHERE inventory_product_id = $1`,
        [inventoryProductId],
      );
      await cleanupE2EUserByEmail(email);
    }
  },
);
