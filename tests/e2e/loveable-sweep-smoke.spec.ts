import { expect, test, type Page } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  disconnectTestDb,
  ensureClientUser,
} from "./db";

/**
 * Smoke spec for the Loveable parity sweep (PR #91). For each surface that
 * was rewritten in the sweep we:
 *
 *   1. Sign in via the E2E_AUTH_MODE backdoor.
 *   2. Navigate to the route.
 *   3. Assert HTTP 200 + a couple of DOM anchors that prove the new chrome
 *      is wired (Loveable-spec copy strings or aria-labels, not
 *      implementation details).
 *   4. Snapshot the page on disk (full-page) for visual review on the PR.
 *   5. Fail the spec if any uncaught console.error or pageerror fires.
 *
 * This is *not* a Loveable cross-diff — that lives in
 * tests/visual/marketing.spec.ts and only runs when LOVEABLE_BASE_URL is
 * set. The cross-diff for authed surfaces is tracked under Phase 10
 * Deferred follow-ups in WISHI-REBUILD-PLAN.md.
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
    clerkId: `e2e_sweep_${prefix}_${ts}`,
    email,
    firstName: "Sweep",
    lastName: "Smoke",
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
  // post-signin redirects fresh CLIENT users to "/" by default. We don't
  // care where it lands as long as we left /sign-in.
  await expect(page).not.toHaveURL(/\/sign-in/);
}

interface RouteCheck {
  name: string;
  path: string;
  expectVisible: string[];
}

const routes: RouteCheck[] = [
  {
    name: "sessions",
    path: "/sessions",
    expectVisible: ["My Style Sessions", "Give the gift of style"],
  },
  {
    name: "settings",
    path: "/settings",
    expectVisible: [
      "Manage your profile, style preferences, membership and more.",
      "Style info",
      "Edit password",
      "Payment history",
    ],
  },
  {
    name: "cart",
    path: "/cart",
    expectVisible: ["My Bag", "Always Free Shipping"],
  },
  {
    name: "favorites",
    path: "/favorites",
    expectVisible: ["Favorites"],
  },
  {
    name: "orders",
    path: "/orders",
    expectVisible: ["My Orders"],
  },
  {
    name: "profile",
    path: "/profile",
    expectVisible: ["Closet"],
  },
];

for (const route of routes) {
  test(`loveable-sweep ${route.name} renders + reads as Loveable`, async ({
    page,
  }, testInfo) => {
    const ctx = await seedClient(route.name);
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(`console: ${msg.text()}`);
    });
    try {
      await signIn(page, ctx.email);
      const response = await page.goto(route.path, { waitUntil: "networkidle" });
      expect(response?.status(), `${route.path} HTTP status`).toBe(200);

      for (const text of route.expectVisible) {
        await expect(
          page.getByText(text, { exact: false }).first(),
          `${route.path} expected to render Loveable copy "${text}"`,
        ).toBeVisible();
      }

      const screenshot = await page.screenshot({ fullPage: true });
      await testInfo.attach(`${route.name}.png`, {
        body: screenshot,
        contentType: "image/png",
      });

      const blocking = consoleErrors.filter(
        (m) =>
          // Filter the noisy dev-only "Image with src ... has either width or
          // height modified" warning; it's a perf hint, not a regression.
          !m.includes("has either width or height modified"),
      );
      expect(
        blocking,
        `${route.path} should render with no uncaught console errors`,
      ).toEqual([]);
    } finally {
      await ctx.cleanup();
    }
  });
}
