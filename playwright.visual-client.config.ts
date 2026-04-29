import { defineConfig, devices } from "@playwright/test";

/**
 * Visual regression config for authed client surfaces.
 *
 * Separate from `playwright.visual.config.ts` (anonymous marketing routes
 * via `npm run dev`) and `playwright.visual-stylist.config.ts` (stylist
 * role behind `requireRole("STYLIST")`). Authed client surfaces sit
 * behind `requireAuth()` and need the E2E_AUTH_MODE backdoor + the
 * `?e2e=1` opt-in on `/sign-in`.
 *
 * Run on first capture:
 *   npx playwright test --config=playwright.visual-client.config.ts --update-snapshots
 * Run on subsequent verification:
 *   npx playwright test --config=playwright.visual-client.config.ts
 *
 * Each spec seeds its own client user via `tests/e2e/db.ts::ensureClientUser`
 * and signs in via the E2E_AUTH_MODE cookie backdoor. Baselines live under
 * `tests/visual/client.spec.ts-snapshots/` with the standard per-OS suffix
 * (`-darwin`, `-linux`).
 */
const port = Number(process.env.VISUAL_PORT ?? 3102);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/visual",
  testMatch: /client\.spec\.ts$/,
  fullyParallel: false, // specs share seeded DB rows, keep sequential
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
    url: `${baseURL}/sign-in?e2e=1`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      ...process.env,
      E2E_AUTH_MODE: "true",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
