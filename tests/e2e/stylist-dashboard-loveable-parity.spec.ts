import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  createSessionForClient,
  disconnectTestDb,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
} from "./db";

/**
 * Loveable design parity for the stylist Dashboard:
 *  - the chat pane never seeds with mock conversations (D7)
 *  - the stylist avatar shows real initials, not the "SM" placeholder (D6)
 *  - drafts come from /api/moodboards?status=draft, not localStorage (D11)
 *  - /bag redirects to /cart for Loveable-shaped retailer links (§3.9)
 */

test.afterAll(async () => {
  await disconnectTestDb();
});

async function signInAsStylist(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/(stylist|sessions|onboarding)/);
}

test("dashboard does not seed mockChats and shows real stylist initials", async ({ page }) => {
  const ts = Date.now();
  const clientEmail = `dash-parity-client-${ts}@e2e.wishi.test`;
  const stylistEmail = `dash-parity-stylist-${ts}@e2e.wishi.test`;
  const clientClerkId = `e2e_dash_parity_client_${ts}`;
  const stylistClerkId = `e2e_dash_parity_stylist_${ts}`;

  const client = await ensureClientUser({
    clerkId: clientClerkId,
    email: clientEmail,
    firstName: "Parity",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: stylistClerkId,
    email: stylistEmail,
    firstName: "Avery",
    lastName: "Lin",
  });
  await ensureStylistProfile({ userId: stylist.id });
  await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });

  try {
    await signInAsStylist(page, stylistEmail);
    await page.goto("/stylist/dashboard");
    await page.waitForLoadState("networkidle");

    const body = await page.locator("body").innerText();

    // The mockChats seed used to fabricate "Friday at 2 would work for me"
    // and a stylist reply mentioning "Concierge" with a 💗 — neither line
    // exists in any real fixture, so their absence is the regression guard.
    expect(body).not.toContain("Friday at 2 would work for me");
    expect(body).not.toContain("Concierge");

    // Real seeded session — the dashboard view-model uses the client's
    // first + last name as the row title.
    expect(body).toContain("Parity Client");

    // Avatar fallback now reads the authed stylist's actual initials. "AL"
    // for Avery Lin replaces the previous hardcoded "SM" placeholder.
    expect(body).toContain("AL");
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("/api/moodboards?status=draft is the source of truth for the dashboard Drafts list", async ({
  page,
}) => {
  const ts = Date.now();
  const clientEmail = `drafts-client-${ts}@e2e.wishi.test`;
  const stylistEmail = `drafts-stylist-${ts}@e2e.wishi.test`;
  const clientClerkId = `e2e_drafts_client_${ts}`;
  const stylistClerkId = `e2e_drafts_stylist_${ts}`;

  const client = await ensureClientUser({
    clerkId: clientClerkId,
    email: clientEmail,
    firstName: "Draft",
    lastName: "Person",
  });
  const stylist = await ensureStylistUser({
    clerkId: stylistClerkId,
    email: stylistEmail,
    firstName: "Drew",
    lastName: "Park",
  });
  await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });

  try {
    await signInAsStylist(page, stylistEmail);

    // Empty before the stylist has authored anything — proves nothing is
    // hydrating from a stale per-device localStorage entry.
    const empty = await page.request.get("/api/moodboards?status=draft");
    expect(empty.ok()).toBe(true);
    const emptyJson = (await empty.json()) as { drafts: unknown[] };
    expect(emptyJson.drafts).toEqual([]);

    // Create a real DB-backed draft via the existing POST.
    const created = await page.request.post("/api/moodboards", {
      data: { sessionId: session.id },
    });
    expect(created.status()).toBe(201);
    const createdBoard = (await created.json()) as { id: string };

    // The new GET surfaces it — and the Drafts list re-fetches on dashboard
    // mount, so this is the data the UI consumes.
    const populated = await page.request.get("/api/moodboards?status=draft");
    const populatedJson = (await populated.json()) as {
      drafts: { id: string; sessionId: string; clientName: string; photoCount: number }[];
    };
    expect(populatedJson.drafts.length).toBe(1);
    expect(populatedJson.drafts[0].id).toBe(createdBoard.id);
    expect(populatedJson.drafts[0].sessionId).toBe(session.id);
    expect(populatedJson.drafts[0].clientName).toBe("Draft Person");
    expect(populatedJson.drafts[0].photoCount).toBe(0);

    // DELETE drops the draft (used by the dashboard trash icon).
    const del = await page.request.delete(`/api/moodboards/${createdBoard.id}`);
    expect(del.ok()).toBe(true);
    const after = await page.request.get("/api/moodboards?status=draft");
    expect((await after.json()).drafts).toEqual([]);
  } finally {
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("/bag permanently redirects to /cart", async ({ page }) => {
  // Inspect the redirect itself rather than the eventual page — /cart is
  // an authed surface, so anonymous traffic gets a second hop to /sign-in.
  // We only care that /bag's first response is a 308 → /cart.
  const res = await page.request.get("/bag", { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers()["location"]).toMatch(/\/cart$/);
});
