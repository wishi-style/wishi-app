import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  ensureStylistProfile,
  ensureStylistUser,
  disconnectTestDb,
} from "./db";

// The stylist dashboard used to ship a 270-LOC mockSessions array and a
// 75-LOC mockChats hashmap as fallback content for unauthed/unhydrated
// states. Those names — Feizhen Dang, Crystal Stokey, Marcus Johnson —
// must NOT render in production. This spec signs in as a fresh stylist
// with zero real sessions and asserts the dashboard renders empty,
// not the old fake fixtures.

test.afterAll(async () => {
  await disconnectTestDb();
});

test("stylist with no sessions sees no fake-fixture session names", async ({
  browser,
}) => {
  test.setTimeout(45_000);
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const stylistEmail = `dash-clean-${ts}@e2e.wishi.test`;

  const stylist = await ensureStylistUser({
    clerkId: `e2e_dash_clean_${ts}`,
    email: stylistEmail,
    firstName: "Empty",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(stylistEmail);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).not.toHaveURL(/\/sign-in/);

    await page.goto("/stylist/dashboard");
    await page.waitForLoadState("networkidle");

    const fakeFixtureNames = [
      "Feizhen Dang",
      "Crystal Stokey",
      "Natalie Ramos",
      "Marcus Johnson",
      "Emma Blakewell",
      "Sofia Nakamura",
      "Daniel Kim",
      "Olivia Bennett",
      "Hannah Wright",
    ];
    const body = await page.locator("body").innerText();
    for (const name of fakeFixtureNames) {
      expect(body, `Fake fixture "${name}" leaked into the dashboard`).not.toContain(name);
    }

    const fakeChatStrings = [
      "I'll schedule the call via Concierge",
      "Like some items",
      "warm tones for sure",
      "wardrobe overhaul for spring",
    ];
    for (const fragment of fakeChatStrings) {
      expect(body, `Fake mockChats fragment "${fragment}" leaked`).not.toContain(fragment);
    }
  } finally {
    await ctx.close();
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
