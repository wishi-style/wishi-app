import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  ensureStylistUser,
  ensureStylistProfile,
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  getPool,
} from "./db";

async function seedNotification(
  userId: string,
  fields: { event: string; category: string; source: string; title: string; body: string; href: string | null },
): Promise<string> {
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO notifications (id, user_id, event, category, source, title, body, href, created_at)
     VALUES ($1, $2, $3, $4::"NotificationCategory", $5::"NotificationSource", $6, $7, $8, NOW())`,
    [id, userId, fields.event, fields.category, fields.source, fields.title, fields.body, fields.href],
  );
  return id;
}

async function signInAs(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-in?e2e=1");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('button[type="submit"]').click();
}

test("stylist bell shows real notifications, click marks read + navigates", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const email = `bell-stylist-${suffix}@e2e.wishi.test`;
  const stylist = await ensureStylistUser({
    clerkId: `e2e_${suffix}`,
    email,
    firstName: "Bell",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });

  const notifId = await seedNotification(stylist.id, {
    event: "tip.received",
    category: "TIP",
    source: "CLIENT",
    title: "You got a $25 tip",
    body: "Olivia left you a tip.",
    href: "/stylist/dashboard?session=abc",
  });

  try {
    await signInAs(page, email);
    await page.waitForURL(/\/stylist\/dashboard/, { timeout: 15_000 });

    await page.locator('button[aria-label*="Notifications"]').first().click();
    await expect(page.getByText("You got a $25 tip")).toBeVisible();
    await expect(page.getByText("Olivia left you a tip.")).toBeVisible();
    await expect(page.locator('button[aria-label*="1 unread"]').first()).toBeVisible();

    await page.getByText("You got a $25 tip").click();
    await page.waitForURL(/session=abc/);

    const after = await getPool().query(
      "SELECT read_at FROM notifications WHERE id = $1",
      [notifId],
    );
    expect(after.rows[0].read_at).not.toBeNull();
  } finally {
    await getPool().query("DELETE FROM notifications WHERE user_id = $1", [stylist.id]);
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(email);
  }
});

test("Mark all read clears the unread badge", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const email = `bell-mark-all-${suffix}@e2e.wishi.test`;
  const stylist = await ensureStylistUser({
    clerkId: `e2e_${suffix}`,
    email,
    firstName: "Mark",
    lastName: "All",
  });
  await ensureStylistProfile({ userId: stylist.id });

  for (let i = 0; i < 3; i++) {
    await seedNotification(stylist.id, {
      event: "session.booked",
      category: "BOOKING",
      source: "CLIENT",
      title: `Booking ${i}`,
      body: "body",
      href: null,
    });
  }

  try {
    await signInAs(page, email);
    await page.waitForURL(/\/stylist\/dashboard/, { timeout: 15_000 });

    await page.locator('button[aria-label*="Notifications"]').first().click();
    await page.getByRole("button", { name: "Mark all read" }).click();
    await expect(page.locator('button[aria-label*="unread"]')).toHaveCount(0);
  } finally {
    await getPool().query("DELETE FROM notifications WHERE user_id = $1", [stylist.id]);
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(email);
  }
});
