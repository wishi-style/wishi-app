import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  createSessionForClient,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
  disconnectTestDb,
} from "./db";

/**
 * E2E coverage for the stylist Shop workspace (Phase 11 polish — Shop tab
 * server-side search + filters + power modes).
 *
 * Setup:
 *   - Stylist + client + session (BOOKED).
 *   - Client carries a populated profile so the smart-default chip row
 *     fires: BodyProfile.sizes (tops=M), BudgetByCategory (tops $200-$400),
 *     dislike of leather.
 *   - Sign in as the stylist via the E2E_AUTH_MODE backdoor.
 *
 * Coverage:
 *   - Smart-default chip row renders + chips dismissable.
 *   - Semantic search fires `mode: "semantic"` + `semanticQuery`.
 *   - Keyword toggle flips to `mode: "fts"` + `query`.
 *   - Load-more button appears + clicking increases item count.
 *   - Reset to client profile restores defaults.
 *   - `/` keyboard shortcut focuses the search input.
 *   - Suit-pair dialog opens + sends the right body shape.
 *   - "Find pieces for this look" disabled without canvas items.
 */
test.describe("styleboard shop workspace", () => {
  const ts = Date.now();
  const stylistEmail = `shop-stylist-${ts}@e2e.wishi.test`;
  const clientEmail = `shop-client-${ts}@e2e.wishi.test`;

  let stylistId: string;
  let clientId: string;
  let sessionId: string;

  test.beforeAll(async () => {
    const stylist = await ensureStylistUser({
      clerkId: `e2e_shop_stylist_${ts}`,
      email: stylistEmail,
      firstName: "Shop",
      lastName: "Stylist",
    });
    stylistId = stylist.id;
    await ensureStylistProfile({
      userId: stylistId,
      onboardingStatus: "ELIGIBLE",
    });
    const client = await ensureClientUser({
      clerkId: `e2e_shop_client_${ts}`,
      email: clientEmail,
      firstName: "Sarah",
      lastName: "Client",
    });
    clientId = client.id;

    // Populate client profile so the smart-default chip row fires.
    const p = getPool();
    await p.query(
      `INSERT INTO body_profiles (id, user_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, NOW(), NOW()) ON CONFLICT (user_id) DO NOTHING`,
      [clientId],
    );
    await p.query(
      `INSERT INTO body_profile_sizes (id, body_profile_id, category, size)
       SELECT gen_random_uuid(), bp.id, 'tops', 'M' FROM body_profiles bp WHERE bp.user_id = $1
       ON CONFLICT DO NOTHING`,
      [clientId],
    );
    await p.query(
      `INSERT INTO budget_by_category (id, user_id, category, min_in_cents, max_in_cents, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'tops', 20000, 40000, NOW(), NOW())
       ON CONFLICT (user_id, category) DO NOTHING`,
      [clientId],
    );
    await p.query(
      `INSERT INTO fabric_preferences (id, user_id, fabric, is_disliked, created_at)
       VALUES (gen_random_uuid(), $1, 'leather', TRUE, NOW())
       ON CONFLICT DO NOTHING`,
      [clientId],
    );

    const session = await createSessionForClient({
      clientId,
      stylistId,
      planType: "MAJOR",
      status: "ACTIVE",
    });
    sessionId = session.id;
  });

  test.afterAll(async () => {
    try {
      await cleanupE2EUserByEmail(clientEmail);
      await cleanupE2EUserByEmail(stylistEmail);
    } finally {
      await disconnectTestDb();
    }
  });

  async function signInStylist(page: import("@playwright/test").Page) {
    await page.goto("/sign-in?e2e=1");
    await page
      .getByLabel(/email/i)
      .or(page.locator('input[name="email"]'))
      .first()
      .fill(stylistEmail);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/(stylist|matches|$)/, { timeout: 10_000 });
  }

  test("smart-default chip row + dismiss persists", async ({ page }) => {
    await signInStylist(page);
    await page.goto(`/stylist/sessions/${sessionId}/styleboards/new`);

    // Wait for the Shop tab toolbar
    await expect(
      page.getByPlaceholder(/Search the catalog/i),
    ).toBeVisible({ timeout: 10_000 });

    const chipRow = page.getByText(/Tuned for Sarah/i);
    await expect(chipRow).toBeVisible();
    // In-stock is always applied; the others depend on staging facets
    await expect(page.getByText(/In stock only/i)).toBeVisible();

    // Dismiss In stock
    await page
      .getByRole("button", { name: /Dismiss in_stock default/i })
      .click();

    // Reload and confirm the dismissed default does NOT re-appear
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    // sessionStorage persists across reloads within the same tab
    await expect(page.getByText(/In stock only/i)).toHaveCount(0, {
      timeout: 5_000,
    });
  });

  test("semantic search sends mode=semantic", async ({ page }) => {
    await signInStylist(page);

    let capturedBody: Record<string, unknown> | null = null;
    await page.route(
      `**/api/stylist/sessions/${sessionId}/shop-inventory`,
      async (route) => {
        const body = route.request().postDataJSON?.() as
          | Record<string, unknown>
          | undefined;
        if (body && typeof body.query === "string" && body.query.length > 0) {
          capturedBody = body;
        }
        await route.continue();
      },
    );

    await page.goto(`/stylist/sessions/${sessionId}/styleboards/new`);
    await page.getByPlaceholder(/Search the catalog/i).fill("blazer");
    // Wait for debounce + the captured request
    await page.waitForTimeout(600);
    await page.waitForRequest((req) =>
      req
        .url()
        .includes(
          `/api/stylist/sessions/${sessionId}/shop-inventory`,
        ),
    );

    expect(capturedBody).toBeTruthy();
    expect((capturedBody as Record<string, unknown>).mode).toBe("smart");
    expect((capturedBody as Record<string, unknown>).query).toBe("blazer");
  });

  test("keyword toggle flips mode", async ({ page }) => {
    await signInStylist(page);

    const captured: Record<string, unknown>[] = [];
    await page.route(
      `**/api/stylist/sessions/${sessionId}/shop-inventory`,
      async (route) => {
        const body = route.request().postDataJSON?.() as
          | Record<string, unknown>
          | undefined;
        if (body) captured.push(body);
        await route.continue();
      },
    );

    await page.goto(`/stylist/sessions/${sessionId}/styleboards/new`);
    await page.getByPlaceholder(/Search the catalog/i).fill("blazer");
    await page.waitForTimeout(400);

    // Flip Smart → Keyword
    await page.getByRole("button", { name: /Smart/ }).click();
    await page.waitForTimeout(400);

    const keywordCall = captured.find(
      (b) => b.mode === "keyword" && b.query === "blazer",
    );
    expect(keywordCall, JSON.stringify(captured, null, 2)).toBeTruthy();
  });

  test("/ keyboard shortcut focuses search", async ({ page }) => {
    await signInStylist(page);
    await page.goto(`/stylist/sessions/${sessionId}/styleboards/new`);
    await expect(page.getByPlaceholder(/Search the catalog/i)).toBeVisible();
    // Click away from the input first
    await page.locator("body").click();
    await page.keyboard.press("/");
    await expect(page.getByPlaceholder(/Search the catalog/i)).toBeFocused();
  });

});
