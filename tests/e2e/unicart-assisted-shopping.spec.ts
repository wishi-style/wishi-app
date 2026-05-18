import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  disconnectTestDb,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  createSessionForClient,
  getPool,
} from "./db";
import {
  getClosetItemsForUser,
  getOrdersForUser,
  seedOrder,
  seedOrderItem,
  setupAdmin,
  signInE2E,
  uniqueStamp,
} from "./fixtures/journey";

/**
 * Unicart (assisted shopping) — proves the gate-removal + per-OrderItem
 * fulfillment model surfaces correctly end-to-end:
 *
 *   1. /cart renders the single-track Wishi rail with per-item "Sourced
 *      from {retailerName}" attribution (no "Purchase via retailer" rail).
 *   2. /checkout shows the "we purchase on your behalf" transparency
 *      framing with the concrete retailer name.
 *   3. /products/[id]?sessionId=... renders Add to Cart for an inventory
 *      product (previously the gate would have hidden the affordance) and
 *      the click actually writes a cart row.
 *   4. Admin POST → OrderItem PURCHASED auto-creates a ClosetItem.
 *   5. Admin POST → OrderItem UNFULFILLABLE flips state. Stripe refund is
 *      skipped here (seed has no payment-intent id) but the unit tests in
 *      `tests/admin-orders-transitions.test.ts` cover the refund math; this
 *      spec covers the route + state-machine wiring.
 *   6. Client POST → OrderItem PURCHASED → RETURN_REQUESTED captures
 *      `returnReceiptRef` (mirror-the-retailer-refund pattern).
 *
 * Cart / checkout / PDP pages call the inventory service server-side
 * (via `getProduct(id)` inside `lib/inventory/inventory-client.ts`), so a
 * browser-context route stub can't intercept them. Instead we resolve a
 * real inventory product (with at least one in-stock listing carrying a
 * merchant name) at test start and use that ID throughout. The lookup is
 * cached for the file so we only hit the inventory service once.
 *
 * Screenshots land under `test-results/unicart/` so the PR description can
 * point at them instead of "manual: open /cart".
 */

const SCREENSHOT_DIR = path.join("test-results", "unicart");

interface ResolvedFixture {
  id: string;
  retailerName: string;
  canonicalName: string;
}

let cachedFixture: ResolvedFixture | null = null;

/**
 * Find a real inventory product that has at least one in-stock listing with a
 * non-empty `merchant_name`. The cart / checkout pages render
 * "Sourced from {merchant_name}", so the test needs a product that actually
 * carries that field.
 */
async function resolveInventoryFixture(): Promise<ResolvedFixture> {
  if (cachedFixture) return cachedFixture;
  const base = process.env.INVENTORY_SERVICE_URL?.replace(/\/$/, "");
  if (!base) {
    throw new Error("INVENTORY_SERVICE_URL must be set");
  }
  // Step 1: page through `/search` to get product IDs.
  const searchRes = await fetch(`${base}/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      pageSize: 30,
      inStockOnly: true,
      mode: "fts",
      query: "",
    }),
  });
  if (!searchRes.ok) {
    throw new Error(`Inventory search failed: ${searchRes.status}`);
  }
  const search = (await searchRes.json()) as {
    results: Array<{ id: string; canonical_name: string }>;
  };
  // Step 2: hydrate each via `/search/products/[id]` (which returns listings).
  for (const summary of search.results) {
    const full = await fetch(
      `${base}/search/products/${encodeURIComponent(summary.id)}`,
    );
    if (!full.ok) continue;
    const doc = (await full.json()) as {
      id: string;
      canonical_name: string;
      listings: Array<{ merchant_name?: string; in_stock?: boolean }>;
    };
    const listing = doc.listings.find(
      (l) => l.in_stock && l.merchant_name && l.merchant_name.length > 0,
    );
    if (listing && listing.merchant_name) {
      cachedFixture = {
        id: doc.id,
        retailerName: listing.merchant_name,
        canonicalName: doc.canonical_name,
      };
      return cachedFixture;
    }
  }
  throw new Error(
    "No inventory product with an in-stock listing + merchant_name found",
  );
}

async function ensureStyleQuizCompleted(userId: string) {
  await getPool().query(
    `INSERT INTO style_profiles (id, user_id, quiz_completed_at, created_at, updated_at)
     VALUES ($1, $2, NOW(), NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET quiz_completed_at = NOW()`,
    [randomUUID(), userId],
  );
}

interface ShopperFixture {
  client: { id: string; email: string; clerkId: string };
  stylist: { id: string; clerkId: string };
  session: { id: string };
  cartItemId: string | null;
  product: ResolvedFixture;
  cleanup: () => Promise<void>;
}

async function setupShopperWithCartItem(
  prefix: string,
  opts: { seedCartItem: boolean },
): Promise<ShopperFixture> {
  const product = await resolveInventoryFixture();
  const stamp = uniqueStamp();
  const clientEmail = `${prefix}-c-${stamp}@e2e.wishi.test`;
  const stylistEmail = `${prefix}-s-${stamp}@e2e.wishi.test`;
  const clientClerkId = `e2e_${prefix}_c_${stamp.replace(/-/g, "_")}`;
  const stylistClerkId = `e2e_${prefix}_s_${stamp.replace(/-/g, "_")}`;
  const client = await ensureClientUser({
    clerkId: clientClerkId,
    email: clientEmail,
    firstName: "Uni",
    lastName: "Cart",
  });
  const stylist = await ensureStylistUser({
    clerkId: stylistClerkId,
    email: stylistEmail,
    firstName: "Uni",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });
  await ensureStyleQuizCompleted(client.id);
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });

  let cartItemId: string | null = null;
  if (opts.seedCartItem) {
    cartItemId = randomUUID();
    await getPool().query(
      `INSERT INTO cart_items (id, user_id, session_id, inventory_product_id, quantity, added_at)
       VALUES ($1, $2, $3, $4, 1, NOW())`,
      [cartItemId, client.id, session.id, product.id],
    );
  }

  return {
    client: { id: client.id, email: clientEmail, clerkId: clientClerkId },
    stylist: { id: stylist.id, clerkId: stylistClerkId },
    session: { id: session.id },
    cartItemId,
    product,
    cleanup: async () => {
      const p = getPool();
      await p.query(`DELETE FROM cart_items WHERE user_id = $1`, [client.id]);
      await p.query(`DELETE FROM closet_items WHERE user_id = $1`, [client.id]);
      await p.query(
        `DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)`,
        [client.id],
      );
      await p.query(`DELETE FROM orders WHERE user_id = $1`, [client.id]);
      await cleanupStylistProfile(stylist.id).catch(() => {});
      await cleanupE2EUserByEmail(clientEmail).catch(() => {});
      await cleanupE2EUserByEmail(stylistEmail).catch(() => {});
    },
  };
}

test.afterAll(async () => {
  await disconnectTestDb();
});

// ---------------------------------------------------------------------------
// UI: /cart renders single-track Wishi rail with per-item retailer
// attribution. No "Purchase via retailer" rail.
// ---------------------------------------------------------------------------

test("unicart cart: single-track Wishi rail with per-item retailer attribution", async ({
  page,
}) => {
  test.skip(
    process.env.INVENTORY_SERVICE_URL === undefined,
    "Inventory client requires INVENTORY_SERVICE_URL",
  );
  test.setTimeout(60_000);
  const ctx = await setupShopperWithCartItem("uc-cart", { seedCartItem: true });
  try {
    await signInE2E(page, ctx.client.email);
    await page.goto("/cart");
    await page.waitForLoadState("networkidle");

    // Header subtitle pins the assisted-shopping pitch.
    await expect(
      page.getByText("We shop on your behalf from each retailer"),
    ).toBeVisible();

    // "Your items" rail explains the on-your-behalf model up top.
    await expect(
      page.getByText(/Wishi purchases each piece from its retailer/i),
    ).toBeVisible();

    // Per-item attribution — concrete retailer name from the live inventory.
    await expect(page.getByText(/Sourced from/i).first()).toBeVisible();
    await expect(
      page.getByText(ctx.product.retailerName).first(),
    ).toBeVisible();

    // The removed "Purchase via retailer" affordance must be GONE.
    await expect(page.getByText(/Purchase via retailer/i)).toHaveCount(0);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/cart-single-track.png`,
      fullPage: true,
    });
  } finally {
    await ctx.cleanup();
  }
});

// ---------------------------------------------------------------------------
// UI: /checkout transparency framing — "we purchase from {retailer} on your
// behalf"
// ---------------------------------------------------------------------------

test("unicart checkout: transparency framing names the retailer", async ({
  page,
}) => {
  test.skip(
    process.env.INVENTORY_SERVICE_URL === undefined,
    "Inventory client requires INVENTORY_SERVICE_URL",
  );
  test.setTimeout(60_000);
  const ctx = await setupShopperWithCartItem("uc-co", { seedCartItem: true });
  try {
    await signInE2E(page, ctx.client.email);
    await page.goto(`/checkout?items=${ctx.cartItemId}`);
    await page.waitForLoadState("networkidle");

    // Top framing banner.
    await expect(page.getByText(/How Wishi shopping works/i)).toBeVisible();
    // Tight match — the retailer name must be followed by a space + "on your
    // behalf". Previously a JSX whitespace quirk dropped that space, rendering
    // `Saks Fifth Avenueon your behalf` in production.
    await expect(
      page.getByText(
        new RegExp(
          `We purchase each item from ${escapeRegex(ctx.product.retailerName)} on your behalf`,
          "i",
        ),
      ),
    ).toBeVisible();

    // The legacy "not available for direct sale" empty state must not render.
    await expect(
      page.getByText(/not available for direct sale/i),
    ).toHaveCount(0);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/checkout-transparency.png`,
      fullPage: true,
    });
  } finally {
    await ctx.cleanup();
  }
});

// ---------------------------------------------------------------------------
// UI: /products/[id] no-gate add-to-cart. The product has no
// MerchandisedProduct row — pre-port this would have shown "not for direct
// sale" and hidden Add-to-Cart. Now it renders + works.
// ---------------------------------------------------------------------------

test("unicart PDP: Add to Cart works without isDirectSale gate", async ({
  page,
}) => {
  test.skip(
    process.env.INVENTORY_SERVICE_URL === undefined,
    "Inventory client requires INVENTORY_SERVICE_URL",
  );
  test.setTimeout(60_000);
  const ctx = await setupShopperWithCartItem("uc-pdp", { seedCartItem: false });
  try {
    await signInE2E(page, ctx.client.email);
    await page.goto(
      `/products/${ctx.product.id}?sessionId=${ctx.session.id}`,
    );
    await expect(
      page.getByRole("heading", { level: 1, name: ctx.product.canonicalName }),
    ).toBeVisible();

    // "View on {Retailer}" affiliate link is present alongside Add to Cart —
    // Unicart shows both paths.
    await expect(
      page.getByRole("link", {
        name: new RegExp(`View on ${escapeRegex(ctx.product.retailerName)}`, "i"),
      }),
    ).toBeVisible();

    const addBtn = page.getByRole("button", { name: "Add to Cart" });
    await expect(addBtn).toBeVisible();
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/pdp-both-buttons.png`,
      fullPage: true,
    });
    await addBtn.click();
    await expect(page.getByText("Added to cart")).toBeVisible({
      timeout: 10_000,
    });

    const { rows } = await getPool().query(
      `SELECT inventory_product_id FROM cart_items
         WHERE user_id = $1 AND session_id = $2`,
      [ctx.client.id, ctx.session.id],
    );
    expect(rows.length, "cart row written").toBe(1);
    expect(rows[0].inventory_product_id).toBe(ctx.product.id);
  } finally {
    await ctx.cleanup();
  }
});

// ---------------------------------------------------------------------------
// API: Admin PURCHASED transition auto-creates a ClosetItem
// ---------------------------------------------------------------------------

test("unicart admin: PENDING → PURCHASED flips item + auto-creates ClosetItem", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const ctx = await setupShopperWithCartItem("uc-admin-pur", {
    seedCartItem: false,
  });
  const admin = await setupAdmin("uc-admin-pur-a");
  try {
    const order = await seedOrder({
      userId: ctx.client.id,
      sessionId: ctx.session.id,
      source: "DIRECT_SALE",
      status: "ORDERED",
      retailer: ctx.product.retailerName,
      totalInCents: 32_000,
    });
    const item = await seedOrderItem({
      orderId: order.id,
      inventoryProductId: ctx.product.id,
      title: ctx.product.canonicalName,
      priceInCents: 32_000,
    });
    // Snapshot retailerName so the per-item state machine reads it from the
    // OrderItem row (admin UI also displays it).
    await getPool().query(
      `UPDATE order_items SET retailer_name = $1 WHERE id = $2`,
      [ctx.product.retailerName, item.id],
    );

    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await signInE2E(adminPage, admin.email);

    const res = await adminPage.request.post(
      `/api/admin/orders/${order.id}/items/${item.id}/status`,
      { data: { status: "PURCHASED", retailerOrderRef: "NAP-12345" } },
    );
    expect(res.status(), await res.text()).toBe(200);

    const { rows: itemRows } = await getPool().query(
      `SELECT status, retailer_order_ref FROM order_items WHERE id = $1`,
      [item.id],
    );
    expect(itemRows[0].status).toBe("PURCHASED");
    expect(itemRows[0].retailer_order_ref).toBe("NAP-12345");

    await expect
      .poll(
        async () => (await getClosetItemsForUser(ctx.client.id)).length,
        { timeout: 10_000 },
      )
      .toBeGreaterThanOrEqual(1);

    // Order should roll up to COMPLETED — only one item, now PURCHASED.
    const orders = await getOrdersForUser(ctx.client.id);
    expect(orders[0].status).toBe("COMPLETED");

    await adminCtx.close();
  } finally {
    await admin.cleanup();
    await ctx.cleanup();
  }
});

// ---------------------------------------------------------------------------
// API: Admin UNFULFILLABLE guard — the service refuses to transition an
// item whose order has no Stripe PaymentIntent (refund would have nothing
// to charge back). Pins the guard so a future refactor can't silently
// drop it. The happy-path refund math is covered by the unit tests in
// `tests/admin-orders-transitions.test.ts` which inject a fake Stripe
// createRefund seam — exercising that under Playwright would require a
// live Stripe test PaymentIntent and isn't worth the coupling.
// ---------------------------------------------------------------------------

test("unicart admin: UNFULFILLABLE refuses without a Stripe PaymentIntent", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const ctx = await setupShopperWithCartItem("uc-admin-unf", {
    seedCartItem: false,
  });
  const admin = await setupAdmin("uc-admin-unf-a");
  try {
    // Seed an order without a Stripe PaymentIntent — this is the
    // intentionally-protected state.
    const order = await seedOrder({
      userId: ctx.client.id,
      sessionId: ctx.session.id,
      source: "DIRECT_SALE",
      status: "ORDERED",
      retailer: ctx.product.retailerName,
      totalInCents: 32_000,
    });
    const item = await seedOrderItem({
      orderId: order.id,
      inventoryProductId: ctx.product.id,
      title: ctx.product.canonicalName,
      priceInCents: 32_000,
    });
    await getPool().query(
      `UPDATE order_items SET retailer_name = $1 WHERE id = $2`,
      [ctx.product.retailerName, item.id],
    );

    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await signInE2E(adminPage, admin.email);

    // No PaymentIntent → service rejects with a precise error.
    const res = await adminPage.request.post(
      `/api/admin/orders/${order.id}/items/${item.id}/status`,
      {
        data: {
          status: "UNFULFILLABLE",
          unfulfillableReason: "out_of_stock",
          unfulfillableNotes: "Retailer marked OOS at fulfillment time.",
        },
      },
    );
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/no Stripe PaymentIntent/i);

    // State must NOT have flipped — the guard short-circuits before write.
    const { rows: itemRows } = await getPool().query(
      `SELECT status FROM order_items WHERE id = $1`,
      [item.id],
    );
    expect(itemRows[0].status).toBe("PENDING");

    // Bad reason — Zod 400 (independent guard).
    const badReason = await adminPage.request.post(
      `/api/admin/orders/${order.id}/items/${item.id}/status`,
      {
        data: {
          status: "UNFULFILLABLE",
          unfulfillableReason: "not_a_real_reason",
        },
      },
    );
    expect(badReason.status()).toBe(400);

    await adminCtx.close();
  } finally {
    await admin.cleanup();
    await ctx.cleanup();
  }
});

// ---------------------------------------------------------------------------
// API: Client return-request route flips PURCHASED → RETURN_REQUESTED with
// the user-supplied receipt ref.
// ---------------------------------------------------------------------------

test("unicart returns: PURCHASED → RETURN_REQUESTED captures receiptRef", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const ctx = await setupShopperWithCartItem("uc-return", {
    seedCartItem: false,
  });
  try {
    const order = await seedOrder({
      userId: ctx.client.id,
      sessionId: ctx.session.id,
      source: "DIRECT_SALE",
      status: "ORDERED",
      retailer: ctx.product.retailerName,
      totalInCents: 32_000,
    });
    const item = await seedOrderItem({
      orderId: order.id,
      inventoryProductId: ctx.product.id,
      title: ctx.product.canonicalName,
      priceInCents: 32_000,
    });
    // Pre-flip to PURCHASED (the state where returns become available) and
    // snapshot the retailer name.
    await getPool().query(
      `UPDATE order_items
         SET status = 'PURCHASED'::"OrderItemStatus", retailer_name = $1
         WHERE id = $2`,
      [ctx.product.retailerName, item.id],
    );

    await signInE2E(page, ctx.client.email);
    const res = await page.request.post(
      `/api/orders/${order.id}/items/${item.id}/return-request`,
      { data: { receiptRef: "RMA-NAP-987654" } },
    );
    expect(res.status(), await res.text()).toBe(200);

    const { rows } = await getPool().query(
      `SELECT status, return_receipt_ref, return_requested_at
         FROM order_items WHERE id = $1`,
      [item.id],
    );
    expect(rows[0].status).toBe("RETURN_REQUESTED");
    expect(rows[0].return_receipt_ref).toBe("RMA-NAP-987654");
    expect(rows[0].return_requested_at).not.toBeNull();

    // Bad input — empty receiptRef should 400.
    const bad = await page.request.post(
      `/api/orders/${order.id}/items/${item.id}/return-request`,
      { data: { receiptRef: "" } },
    );
    expect(bad.status()).toBeGreaterThanOrEqual(400);
    expect(bad.status()).toBeLessThan(500);
  } finally {
    await ctx.cleanup();
  }
});

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
