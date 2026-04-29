import { expect, test } from "@playwright/test";
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

test.afterAll(async () => {
  await disconnectTestDb();
});

test("loyalty tier card on /settings reflects GOLD after 3 completed sessions", async ({
  browser,
}) => {
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const clientEmail = `loy-c-${ts}@e2e.wishi.test`;
  const stylistEmail = `loy-s-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_loy_c_${ts}`,
    email: clientEmail,
    firstName: "Loyal",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_loy_s_${ts}`,
    email: stylistEmail,
    firstName: "Helpful",
    lastName: "Stylist",
  });
  const stylistProfile = await ensureStylistProfile({
    userId: stylist.id,
    matchEligible: true,
    isAvailable: true,
  });

  try {
    // Seed 3 COMPLETED sessions so the loyalty recompute lands in GOLD.
    for (let i = 0; i < 3; i++) {
      const s = await createSessionForClient({
        clientId: client.id,
        stylistId: stylist.id,
      });
      await getPool().query(
        `UPDATE sessions SET status = 'COMPLETED', completed_at = NOW() WHERE id = $1`,
        [s.id],
      );
    }
    // Write the LoyaltyAccount + denormalized User.loyaltyTier directly —
    // mirrors what sessions/transitions.ts::approveEnd would have done at
    // session completion. Keeps the spec focused on the settings UI render
    // (the service-level tier logic is already covered by
    // tests/loyalty-service.test.ts).
    await getPool().query(
      `INSERT INTO loyalty_accounts (id, user_id, lifetime_booking_count, tier, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 3, 'GOLD', NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET lifetime_booking_count = 3, tier = 'GOLD', updated_at = NOW()`,
      [client.id],
    );
    await getPool().query(
      `UPDATE users SET loyalty_tier = 'GOLD' WHERE id = $1`,
      [client.id],
    );

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(clientEmail);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).not.toHaveURL(/\/sign-in/);

    await page.goto("/settings");
    await expect(page.getByText("Loyalty rewards")).toBeVisible();
    await expect(page.getByText("Gold", { exact: false })).toBeVisible();
    await expect(
      page.getByText("3 of 8 bookings to Platinum"),
    ).toBeVisible();
    await expect(
      page.getByText("5 more bookings to Platinum"),
    ).toBeVisible();

    await ctx.close();
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
    // Suppress unused-var warning — stylistProfile is used only as a
    // seeded side effect of ensureStylistProfile.
    void stylistProfile;
  }
});
