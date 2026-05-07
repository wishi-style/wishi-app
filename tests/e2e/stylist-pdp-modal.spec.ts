import { expect, test, type Page } from "@playwright/test";
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

// Regression coverage for the stylist look-creator product detail modal.
// Two pre-existing bugs caused the modal to render badly:
//   1. The shadcn-nova `DialogContent` defaulted to `sm:max-w-sm` (384px),
//      which silently beat the consumer's `max-w-3xl` override because
//      tailwind-merge keeps responsive variants separate. The fix changed
//      the primitive default to `sm:max-w-lg` and prefixed every consumer
//      override with `sm:` so they compose cleanly.
//   2. `builder.tsx` concatenated `${brand} — ${name}` into the dialog's
//      `brand` field, and the dialog (mirroring Loveable verbatim) then
//      rendered that string twice — once as a small caption and once as
//      a giant serif heading. The fix passes brand and name as separate
//      fields and renders name in the heading slot.
// This spec pins both fixes.

test.afterAll(async () => {
  await disconnectTestDb();
});

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in?e2e=1");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/(stylist|sessions|onboarding)/, {
    timeout: 30_000,
  });
}

test("stylist look creator product modal: wide layout, no title duplication", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const clientEmail = `pdp-client-${ts}@e2e.wishi.test`;
  const stylistEmail = `pdp-stylist-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_pdp_c_${ts}`,
    email: clientEmail,
    firstName: "Pdp",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_pdp_s_${ts}`,
    email: stylistEmail,
    firstName: "Pdp",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });
  await getPool().query(
    `UPDATE sessions SET twilio_channel_sid = $1 WHERE id = $2`,
    [`CH_e2e_pdp_${ts}`, session.id],
  );

  try {
    // Stub the inventory search so we control brand/name/sizes deterministically.
    // The first product carries the same many-size shape that triggered the
    // user-visible bug (Rodd & Gunn jeans with ~30 size tokens).
    await page.route("**/api/products", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          total: 1,
          page: 1,
          pageSize: 24,
          pages: 1,
          results: [
            {
              id: "pdp-test-1",
              canonical_name: "Gunn Straight Fit Jeans",
              canonical_description: null,
              brand_id: "brand-rg",
              brand_name: "Rodd & Gunn",
              category_id: "cat-bottoms",
              category_slug: "bottoms",
              gender: "male",
              gtin: "",
              min_price: 79,
              max_price: 79,
              currency: "USD",
              in_stock: true,
              listing_count: 1,
              primary_image_url: null,
              image_urls: [],
              available_sizes: [
                "27L", "28L", "28R", "28S", "30L", "30R", "30S",
                "32L", "32R", "32S", "33L", "33R", "33S", "34L",
                "34R", "34S", "35L", "35R", "35S", "36L", "36R",
                "36S", "38L", "38R", "38S", "40L", "40R", "40S",
                "42L", "42R", "42S", "44L", "44R", "44S",
              ],
              available_colors: [],
              color_families: [],
              primary_fabric: null,
              fabric_tier: null,
              contains_leather: null,
              updated_at: "2026-05-07T00:00:00Z",
              listings: [
                {
                  merchant_name: "Nordstrom",
                  product_url: "https://nordstrom.example/rodd-gunn-jeans",
                  price: 79,
                  currency: "USD",
                  in_stock: true,
                },
              ],
            },
          ],
        }),
      });
    });

    await signIn(page, stylistEmail);
    await page.goto(`/stylist/sessions/${session.id}/styleboards/new`);
    await page.waitForLoadState("networkidle");

    // Open the PDP modal by clicking the only product card in the grid.
    await page.getByRole("img", { name: "Gunn Straight Fit Jeans" }).first().click();

    const dialog = page.locator('[data-slot="dialog-content"]');
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(300);
    await dialog.screenshot({ path: "test-results/pdp-modal-after.png" });

    // Width pin: max-w-3xl (768px) must apply on desktop. Pre-fix this
    // was capped at sm:max-w-sm (384px). Allow a generous floor of 600px
    // so the test is robust to padding/border math.
    const box = await dialog.boundingBox();
    expect(box, "dialog should be measurable").not.toBeNull();
    expect(box!.width).toBeGreaterThan(600);

    // Title pin: small caption is the brand alone; large heading is the
    // product name alone. Pre-fix both rendered "Rodd & Gunn — Gunn Straight Fit Jeans".
    const heading = dialog.getByRole("heading", { level: 2 });
    await expect(heading).toHaveText("Gunn Straight Fit Jeans");
    await expect(heading).not.toContainText("—");

    // Caption pin: small caption is brand-only (or "Retailer × Brand" when
    // staging provides a retailer). Pre-fix it rendered the concatenated
    // `${brand} — ${name}` string. Crucially: caption !== heading.
    const captionText = await dialog
      .locator('h2 ~ *, h2')
      .first()
      .evaluate((el) => {
        const parent = el.parentElement!;
        const firstP = parent.querySelector("p");
        return firstP?.textContent ?? "";
      });
    expect(captionText.toLowerCase()).toContain("rodd & gunn");
    expect(captionText).not.toContain("Gunn Straight Fit Jeans");
    expect(captionText).not.toContain("—");
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
