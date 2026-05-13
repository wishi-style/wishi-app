import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { ensureClientUser, cleanupE2EUserByEmail, getPool } from "./db";

async function seedClientNotification(userId: string, title: string, body: string, href: string | null): Promise<string> {
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO notifications (id, user_id, event, category, source, title, body, href, created_at)
     VALUES ($1, $2, 'styleboard.sent', 'MESSAGE'::"NotificationCategory", 'CLIENT'::"NotificationSource", $3, $4, $5, NOW())`,
    [id, userId, title, body, href],
  );
  return id;
}

test("client bell shows real notifications between My Style Sessions and cart", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const email = `bell-client-${suffix}@e2e.wishi.test`;
  const client = await ensureClientUser({
    clerkId: `e2e_${suffix}`,
    email,
    firstName: "Bell",
    lastName: "Client",
  });

  await seedClientNotification(
    client.id,
    "New look from your stylist",
    "Open to view 12 pieces.",
    "/sessions/xyz/chat",
  );

  try {
    await page.goto("/sign-in?e2e=1");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 15_000 });

    await page.goto("/sessions");
    await expect(page.locator('header button[aria-label*="Notifications"]')).toBeVisible();

    // DOM-order assertion: My Style Sessions → Notifications → Cart in the header.
    const headerText = await page.locator("header").innerText();
    const myIdx = headerText.indexOf("My Style Sessions");
    expect(myIdx).toBeGreaterThan(-1);

    // The Notifications button sits between My Style Sessions and the Cart link.
    const buttons = await page.locator("header > div > div > div > *").allInnerTexts();
    const order = buttons.join("|");
    expect(order.indexOf("My Style Sessions")).toBeLessThan(order.indexOf("Cart") === -1 ? 99999 : order.indexOf("Cart"));

    await page.locator('header button[aria-label*="Notifications"]').click();
    await expect(page.getByText("New look from your stylist")).toBeVisible();
  } finally {
    await getPool().query("DELETE FROM notifications WHERE user_id = $1", [client.id]);
    await cleanupE2EUserByEmail(email);
  }
});
