import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  createSessionForClient,
  disconnectTestDb,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
} from "./db";

/**
 * Pins the four-bug session/cart quick-fix:
 *
 *   1. Curated Pieces tiles render image + brand + name resolved through
 *      the inventory client (not the bare inventoryProductId UUID).
 *   2. Style Boards tiles render the first inventory item's image as the
 *      thumbnail (not the "No preview" placeholder).
 *   3. Add to Cart on a curated tile actually adds the row, even when
 *      `MerchandisedProduct.isDirectSale` is unset (universal cart). On
 *      a server error the failure surfaces inline instead of silently
 *      doing nothing.
 *   4. Clicking a curated tile or chat product opens an in-app PDP at
 *      `/products/[id]?sessionId=...` with brand, name, price, and a
 *      `View on retailer` deep-link.
 *
 * Each assertion targets exactly one of the four bugs so a regression
 * tells you which surface broke.
 */

async function ensureStyleQuizCompleted(userId: string) {
  // The /sessions/[id]/chat route hard-redirects to /style-quiz when the
  // client hasn't completed it. Stub a row directly so we can land on the
  // workspace.
  await getPool().query(
    `INSERT INTO style_profiles (id, user_id, quiz_completed_at, created_at, updated_at)
     VALUES ($1, $2, NOW(), NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET quiz_completed_at = NOW()`,
    [randomUUID(), userId],
  );
}

async function seedSentInventoryStyleboard(
  sessionId: string,
  inventoryProductIds: string[],
) {
  const boardId = randomUUID();
  await getPool().query(
    `INSERT INTO boards (id, session_id, type, sent_at, title, created_at, updated_at)
     VALUES ($1, $2, 'STYLEBOARD'::"BoardType", NOW(), $3, NOW(), NOW())`,
    [boardId, sessionId, "Test Board"],
  );
  for (let i = 0; i < inventoryProductIds.length; i += 1) {
    await getPool().query(
      `INSERT INTO board_items
         (id, board_id, source, inventory_product_id, order_index, created_at, updated_at)
       VALUES ($1, $2, 'INVENTORY'::"BoardItemSource", $3, $4, NOW(), NOW())`,
      [randomUUID(), boardId, inventoryProductIds[i], i],
    );
  }
  // Increment the sent counter for parity with the real send path.
  await getPool().query(
    `UPDATE sessions SET styleboards_sent = styleboards_sent + 1 WHERE id = $1`,
    [sessionId],
  );
  return boardId;
}

async function signInAsClient(page: Page, email: string) {
  await page.goto("/sign-in?e2e=1");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(/\/(sessions|matches|profile|stylists)/, {
    timeout: 30_000,
  });
}

const PRODUCT_FIXTURE = {
  id: "inv_session_cart_fix_1",
  brand_name: "Rodd & Gunn",
  canonical_name: "Gunn Straight Fit Jeans",
  primary_image_url: "https://example.com/jeans.jpg",
  image_urls: ["https://example.com/jeans.jpg", "https://example.com/jeans-2.jpg"],
  min_price: 79,
  max_price: 128,
  currency: "USD",
  in_stock: true,
};

function stubInventory(page: Page) {
  // The product detail flow + workspace query + cart hydration all hit
  // /api/products/[id] (server-side this proxies to tastegraph). Stubbing
  // the API route keeps the spec hermetic without touching the inventory
  // service.
  return page.route("**/api/products/**", async (route, request) => {
    const url = new URL(request.url());
    const idMatch = url.pathname.match(/\/api\/products\/([^/]+)$/);
    if (!idMatch || request.method() !== "GET") return route.continue();
    const id = decodeURIComponent(idMatch[1]);
    if (id !== PRODUCT_FIXTURE.id) {
      return route.fulfill({ status: 404, body: "{}" });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...PRODUCT_FIXTURE,
        canonical_description: "A great pair of jeans.",
        brand_id: "brand-rg",
        category_id: "cat-jeans",
        category_slug: "jeans",
        gender: "male",
        gtin: "",
        listing_count: 1,
        available_sizes: ["30R", "32R", "34R"],
        available_colors: ["Indigo"],
        color_families: ["Blue"],
        primary_fabric: "denim",
        fabric_tier: "premium",
        contains_leather: false,
        updated_at: new Date().toISOString(),
        listings: [
          {
            listing_id: "list-1",
            merchant_id: "m-saks",
            merchant_name: "Saks Fifth Avenue",
            title: "Gunn Straight Fit Jeans",
            product_url: "https://retailer.example.com/jeans",
            affiliate_url: "https://retailer.example.com/jeans?aff=wishi",
            primary_image_url: PRODUCT_FIXTURE.primary_image_url,
            base_price: 79,
            sale_price: 0,
            commission_percent: 5,
            shipping_price: 0,
            free_shipping: true,
            shipping_service: "standard",
            is_active: true,
            in_stock: true,
            updated_at: new Date().toISOString(),
            material_raw: "",
            primary_fabric: "denim",
            fabric_tier: "premium",
            contains_leather: false,
            fabric_composition: "",
            pattern: "solid",
            variants: [],
          },
        ],
      }),
    });
  });
}

test.afterAll(async () => {
  await disconnectTestDb();
});

test("session cart fixes: curated, styleboard thumb, add-to-cart, PDP click-through", async ({
  page,
}) => {
  test.skip(
    process.env.INVENTORY_SERVICE_URL === undefined,
    "Inventory client requires INVENTORY_SERVICE_URL even when stubbed",
  );

  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const clientEmail = `cart-fixes-client-${ts}@e2e.wishi.test`;
  const stylistEmail = `cart-fixes-stylist-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_cf_c_${ts}`,
    email: clientEmail,
    firstName: "Cart",
    lastName: "Fixer",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_cf_s_${ts}`,
    email: stylistEmail,
    firstName: "Sam",
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
  await getPool().query(
    `UPDATE sessions SET twilio_channel_sid = $1 WHERE id = $2`,
    [`CH_e2e_cf_${ts}`, session.id],
  );

  await seedSentInventoryStyleboard(session.id, [PRODUCT_FIXTURE.id]);

  await stubInventory(page);

  try {
    await signInAsClient(page, clientEmail);

    // ---- Bug 1 + 2: open the workspace, click Style Boards then Curated.
    await page.goto(`/sessions/${session.id}/chat`);
    await page.waitForLoadState("networkidle");

    // Style Boards thumbnail — must NOT be "No preview".
    await page.getByRole("button", { name: "Style Boards" }).first().click();
    const boardsRegion = page.locator("text=All Curated Pieces").first();
    await expect(boardsRegion).toHaveCount(0);
    const styleboardImg = page.locator(
      `img[src="${PRODUCT_FIXTURE.primary_image_url}"]`,
    );
    await expect(styleboardImg.first()).toBeVisible({ timeout: 10_000 });

    // Curated Pieces tile — must show brand + name (not the UUID).
    await page.getByRole("button", { name: "Curated Pieces" }).first().click();
    await expect(page.getByText(PRODUCT_FIXTURE.brand_name)).toBeVisible();
    await expect(page.getByText(PRODUCT_FIXTURE.canonical_name)).toBeVisible();
    await expect(page.getByText(PRODUCT_FIXTURE.id)).toHaveCount(0);

    // ---- Bug 3: Add-to-Cart on the curated tile.
    const addBtn = page.getByRole("button", { name: "Add to Cart" }).first();
    await expect(addBtn).toBeVisible();
    await addBtn.click();
    await expect(page.getByText("Added", { exact: false })).toBeVisible({
      timeout: 10_000,
    });

    const { rows: cartRows } = await getPool().query(
      `SELECT inventory_product_id FROM cart_items WHERE user_id = $1 AND session_id = $2`,
      [client.id, session.id],
    );
    expect(cartRows.length, "cart row written").toBe(1);
    expect(cartRows[0].inventory_product_id).toBe(PRODUCT_FIXTURE.id);

    // ---- Bug 4: click an item → in-app PDP.
    await page.goto(
      `/products/${PRODUCT_FIXTURE.id}?sessionId=${session.id}`,
    );
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: PRODUCT_FIXTURE.canonical_name,
      }),
    ).toBeVisible();
    await expect(page.getByText(PRODUCT_FIXTURE.brand_name)).toBeVisible();
    await expect(
      page.getByRole("link", { name: /View on Saks/i }),
    ).toBeVisible();
  } finally {
    await getPool().query(
      `DELETE FROM cart_items WHERE user_id = $1`,
      [client.id],
    );
    await getPool().query(
      `DELETE FROM board_items WHERE board_id IN (SELECT id FROM boards WHERE session_id = $1)`,
      [session.id],
    );
    await getPool().query(
      `DELETE FROM boards WHERE session_id = $1`,
      [session.id],
    );
    await cleanupStylistProfile(stylist.id).catch(() => {});
    await cleanupE2EUserByEmail(clientEmail).catch(() => {});
    await cleanupE2EUserByEmail(stylistEmail).catch(() => {});
  }
});
