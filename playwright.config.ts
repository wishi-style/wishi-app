import { defineConfig } from "@playwright/test";

const port = 3001;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html"], ["list"]] : "list",
  globalSetup: "./tests/e2e/global-setup.js",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: process.env.CI ? "npm run start:e2e:prebuilt" : "npm run start:e2e",
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
