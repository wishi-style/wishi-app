import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  ensureStylistUser,
  ensureStylistProfile,
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  getPool,
} from "./db";

test("toast fires for newly-arrived notification (mid-session insert)", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const email = `toast-${suffix}@e2e.wishi.test`;
  const stylist = await ensureStylistUser({
    clerkId: `e2e_${suffix}`,
    email,
    firstName: "Toast",
    lastName: "Test",
  });
  await ensureStylistProfile({ userId: stylist.id });

  try {
    await page.goto("/sign-in?e2e=1");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/stylist\/dashboard/, { timeout: 15_000 });

    // Initial state: zero notifications. Hook establishes baseline (no toast).
    await page.waitForTimeout(2000);

    // Insert a notification mid-session.
    await getPool().query(
      `INSERT INTO notifications (id, user_id, event, category, source, title, body, href, created_at)
       VALUES ($1, $2, 'tip.received', 'TIP'::"NotificationCategory", 'CLIENT'::"NotificationSource",
               'Mid-session tip', 'Toast me!', '/stylist/dashboard', NOW())`,
      [randomUUID(), stylist.id],
    );

    // Sonner renders into the body via portal. Wait up to ~12s for the next
    // poll cycle (10s interval + a little buffer).
    await expect(page.getByText("Mid-session tip")).toBeVisible({ timeout: 12_000 });
    await expect(page.getByText("Toast me!")).toBeVisible();
  } finally {
    await getPool().query("DELETE FROM notifications WHERE user_id = $1", [stylist.id]);
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(email);
  }
});
