import { defineConfig, devices } from "@playwright/test";

/**
 * Visual regression config for the phase 10 Loveable port.
 *
 * Two modes:
 * 1) Default — captures wishi-app screenshots at desktop + mobile viewports
 *    and diffs each against its committed baseline. First run creates the
 *    baselines; subsequent runs assert <0.5% pixel delta. Run with
 *    `npm run test:visual`; add `--update-snapshots` on first run or after
 *    an intentional visual change.
 * 2) Loveable-diff (manual) — when LOVEABLE_BASE_URL is set (e.g. the
 *    Loveable dev server on http://localhost:8080), the same specs
 *    additionally capture Loveable screenshots and assert <2% pixel delta
 *    against ours. This is the phase 10 "Loveable dev server fidelity"
 *    check — run manually after spinning up the Vite dev server:
 *    `LOVEABLE_BASE_URL=http://localhost:8080 npm run test:visual`.
 */
const port = Number(process.env.VISUAL_PORT ?? 3100);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/visual",
  // Stylist specs are behind requireRole("STYLIST") and need E2E_AUTH_MODE.
  // They run under playwright.visual-stylist.config.ts, which boots dev:e2e.
  testIgnore: [/stylist\.spec\.ts$/],
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
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
    command: `npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
