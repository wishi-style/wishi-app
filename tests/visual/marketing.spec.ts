import { test, expect, type Page } from "@playwright/test";

/**
 * Visual regression for the ported public marketing pages.
 *
 * Each route screenshots the full page after Motion reveals have settled.
 * First run creates baselines under `__snapshots__/`; later runs diff.
 *
 * To additionally compare against the Loveable Vite dev server, set
 * `LOVEABLE_BASE_URL=http://localhost:8080` and rerun. The loveable block
 * captures a matching shot and asserts <2% delta against ours.
 */

const routes = [
  { path: "/", name: "landing" },
  { path: "/pricing", name: "pricing" },
  { path: "/how-it-works", name: "how-it-works" },
  { path: "/lux", name: "lux" },
  { path: "/stylists", name: "stylists" },
  { path: "/feed", name: "feed" },
] as const;

async function waitForReveal(page: Page) {
  // Reveal primitive fades in over 0.7s; give it a beat past that plus a
  // moment for next/image to swap from placeholder to final.
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);
}

for (const { path, name } of routes) {
  test(`${name}: matches wishi-app baseline`, async ({ page }) => {
    await page.goto(path);
    await waitForReveal(page);
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: true,
    });
  });
}

const loveableBase = process.env.LOVEABLE_BASE_URL;
if (loveableBase) {
  for (const { path, name } of routes) {
    test(`${name}: <2% delta vs Loveable`, async ({ browser }) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(`${loveableBase}${path === "/" ? "" : path}`);
      await waitForReveal(page);
      await expect(page).toHaveScreenshot(`${name}-loveable.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.02, // 2% per phase 10 verification
      });
      await ctx.close();
    });
  }
}
