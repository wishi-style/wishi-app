import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  createSessionForClient,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getWaitlistEntry,
  disconnectTestDb,
} from "./db";

test.afterAll(async () => {
  await disconnectTestDb();
});

test("unavailable stylist shows Join Waitlist and creates a waitlist entry", async ({ page }) => {
  const clientEmail = `waitlist-client-${Date.now()}@e2e.wishi.test`;
  const stylistEmail = `waitlist-stylist-${Date.now()}@e2e.wishi.test`;
  const stylistClerkId = `e2e_wl_stylist_${Date.now()}`;

  const client = await ensureClientUser({
    clerkId: `e2e_wl_client_${Date.now()}`,
    email: clientEmail,
    firstName: "Waitlist",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: stylistClerkId,
    email: stylistEmail,
    firstName: "Busy",
    lastName: "Stylist",
  });
  const profile = await ensureStylistProfile({
    userId: stylist.id,
    isAvailable: false,
    matchEligible: true,
  });

  // Sign in as the client
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(clientEmail);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/sessions/);

  // Visit the unavailable stylist's profile
  await page.goto(`/stylists/${profile.id}`);
  await expect(page.getByText("Busy Stylist")).toBeVisible();

  // Should see "Join Waitlist" button, NOT "Book This Stylist"
  await expect(page.getByRole("button", { name: "Join Waitlist" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Book This Stylist" })).toHaveCount(0);

  // Click to join waitlist
  await page.getByRole("button", { name: "Join Waitlist" }).click();
  await expect(page.getByText("You're on the waitlist")).toBeVisible();

  // Verify DB row
  const entry = await getWaitlistEntry(client.id, profile.id);
  expect(entry).not.toBeNull();
  expect(entry.status).toBe("PENDING");

  // Cleanup
  await cleanupStylistProfile(stylist.id);
  await cleanupE2EUserByEmail(clientEmail);
  await cleanupE2EUserByEmail(stylistEmail);
});

test("user with active session sees redirect instead of checkout", async ({ page }) => {
  const clientEmail = `guard-client-${Date.now()}@e2e.wishi.test`;
  const stylistEmail = `guard-stylist-${Date.now()}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_guard_client_${Date.now()}`,
    email: clientEmail,
    firstName: "Guard",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_guard_stylist_${Date.now()}`,
    email: stylistEmail,
    firstName: "Active",
    lastName: "Stylist",
  });
  const profile = await ensureStylistProfile({
    userId: stylist.id,
    isAvailable: true,
    matchEligible: true,
  });

  // Create an existing ACTIVE session between this client and stylist
  await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
  });

  // Sign in
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(clientEmail);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/sessions/);

  // Visit stylist profile — should show "Book This Stylist" since stylist is available
  await page.goto(`/stylists/${profile.id}`);
  await expect(page.getByText("Active Stylist")).toBeVisible();
  await expect(page.getByRole("link", { name: "Book This Stylist" })).toBeVisible();

  // Click book — the server action should detect the active session and redirect to /sessions
  await page.getByRole("link", { name: "Book This Stylist" }).click();
  await expect(page).toHaveURL(/\/bookings\/new/);

  // Select Mini and submit — the server action should redirect to /sessions
  await page.getByText("Mini").click();
  await page.getByRole("button", { name: "Proceed to Checkout" }).click();

  // Should be redirected back to sessions (active session guard)
  await expect(page).toHaveURL(/\/sessions/);

  // Cleanup
  await cleanupStylistProfile(stylist.id);
  await cleanupE2EUserByEmail(clientEmail);
  await cleanupE2EUserByEmail(stylistEmail);
});

test("Lux plan hides subscription toggle, Mini/Major show it", async ({ page }) => {
  const clientEmail = `plans-client-${Date.now()}@e2e.wishi.test`;

  await ensureClientUser({
    clerkId: `e2e_plans_client_${Date.now()}`,
    email: clientEmail,
    firstName: "Plans",
    lastName: "Client",
  });

  // Sign in
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(clientEmail);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/sessions/);

  // Navigate to booking page
  await page.goto("/bookings/new");

  // All three plans should be visible
  await expect(page.getByText("Mini")).toBeVisible();
  await expect(page.getByText("Major")).toBeVisible();
  await expect(page.getByText("Lux")).toBeVisible();

  // Select Mini — subscription toggle should appear
  await page.getByText("Mini").click();
  await expect(page.getByText("Subscribe monthly")).toBeVisible();

  // Select Major — subscription toggle should still be visible
  await page.getByText("Major").click();
  await expect(page.getByText("Subscribe monthly")).toBeVisible();

  // Select Lux — subscription toggle should disappear
  await page.getByText("Lux").click();
  await expect(page.getByText("Subscribe monthly")).toHaveCount(0);

  // Switch back to Mini — toggle reappears
  await page.getByText("Mini").click();
  await expect(page.getByText("Subscribe monthly")).toBeVisible();

  // Cleanup
  await cleanupE2EUserByEmail(clientEmail);
});

test("Mini plan shows correct price and styleboard count", async ({ page }) => {
  const clientEmail = `mini-client-${Date.now()}@e2e.wishi.test`;

  await ensureClientUser({
    clerkId: `e2e_mini_client_${Date.now()}`,
    email: clientEmail,
    firstName: "Mini",
    lastName: "Client",
  });

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(clientEmail);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/sessions/);

  await page.goto("/bookings/new");

  // Verify plan details render from seeded DB data
  await expect(page.getByText("$60")).toBeVisible();
  await expect(page.getByText("$130")).toBeVisible();
  await expect(page.getByText("$550")).toBeVisible();
  // Use locator to scope to plan cards — description text also contains "styleboards"
  await expect(page.locator("p").filter({ hasText: /^2 styleboards$/ })).toBeVisible();
  await expect(page.locator("p").filter({ hasText: /^5 styleboards$/ })).toBeVisible();
  await expect(page.locator("p").filter({ hasText: /^8 styleboards$/ })).toBeVisible();

  await cleanupE2EUserByEmail(clientEmail);
});
