import { expect, test, type Page } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  disconnectTestDb,
  ensureClientUser,
} from "../e2e/db";

/**
 * Visual regression for authed client surfaces — the empty-state baselines.
 *
 * Each spec seeds a fresh client user via `ensureClientUser`, signs in via
 * the E2E_AUTH_MODE backdoor (gated behind `?e2e=1` per PR #74), navigates
 * to the surface, and screenshots its empty / first-run state. Surfaces
 * that need richer fixtures (active session for `/sessions/[id]/chat`,
 * cart with line items for `/checkout`, completed quiz for `/matches`) are
 * covered by Playwright e2e specs and tracked in CLIENT-PARITY-AUDIT.md
 * as deferred visual baselines.
 *
 * Run with:
 *   npx playwright test --config=playwright.visual-client.config.ts
 */

test.afterAll(async () => {
  await disconnectTestDb();
});

interface Ctx {
  email: string;
  cleanup: () => Promise<void>;
}

async function seedClient(prefix: string): Promise<Ctx> {
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const email = `${prefix}-${ts}@e2e.wishi.test`;
  await ensureClientUser({
    clerkId: `e2e_visual_client_${prefix}_${ts}`,
    email,
    firstName: "Visual",
    lastName: "Client",
  });
  return {
    email,
    async cleanup() {
      await cleanupE2EUserByEmail(email);
    },
  };
}

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in?e2e=1");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/(sessions|stylists|onboarding|profile|cart|matches|favorites|orders|settings|match-quiz)/);
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
}

const routes = [
  { path: "/sessions", name: "client-sessions" },
  { path: "/cart", name: "client-cart" },
  { path: "/orders", name: "client-orders" },
  { path: "/favorites", name: "client-favorites" },
  { path: "/profile", name: "client-profile" },
  { path: "/settings", name: "client-settings" },
] as const;

for (const route of routes) {
  test(`${route.name} visual baseline`, async ({ page }) => {
    const ctx = await seedClient(route.name);
    try {
      await signIn(page, ctx.email);
      await page.goto(route.path);
      await settle(page);
      await expect(page).toHaveScreenshot(`${route.name}.png`, {
        fullPage: true,
      });
    } finally {
      await ctx.cleanup();
    }
  });
}
