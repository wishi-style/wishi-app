import { defineConfig, devices } from "@playwright/test";

/**
 * Visual regression config for the Phase 12 stylist-frontend port.
 *
 * Separate from the Phase 10 marketing visual harness because stylist
 * surfaces are behind the `requireRole("STYLIST")` guard, which means
 * the tests have to sign in via the E2E_AUTH_MODE backdoor — and
 * `npm run dev` (the Phase 10 harness webServer) doesn't set that flag.
 *
 * Run on first capture: `npx playwright test --config=playwright.visual-stylist.config.ts --update-snapshots`
 * Run on subsequent verification: `npx playwright test --config=playwright.visual-stylist.config.ts`
 *
 * Each spec seeds its own stylist user via tests/e2e/db.ts and signs in
 * using the E2E_AUTH_MODE cookie backdoor. Baselines live under
 * `tests/visual/stylist.spec.ts-snapshots/` with the standard per-OS
 * suffix (`-darwin`, `-linux`).
 */
const port = Number(process.env.VISUAL_PORT ?? 3101);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/visual",
  testMatch: /stylist\.spec\.ts$/,
  fullyParallel: false, // specs share a seeded DB row, keep sequential
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.js",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.005, // 0.5%
      animations: "disabled",
      caret: "hide",
    },
  },
  projects: [
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: `npm run dev:e2e -- --port ${port}`,
    url: `${baseURL}/sign-in`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      ...process.env,
      E2E_AUTH_MODE: "true",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
