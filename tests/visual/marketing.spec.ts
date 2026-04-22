import { test, expect, type Page } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

/**
 * Visual regression for the ported public marketing pages.
 *
 * Each route screenshots the full page after Motion reveals have settled.
 * First run creates baselines under `__snapshots__/`; later runs diff.
 *
 * To additionally compare against the Loveable Vite dev server, set
 * `LOVEABLE_BASE_URL=http://localhost:8080` and rerun. The loveable block
 * captures a same-viewport shot on the Loveable render and pixel-diffs it
 * against the wishi-app capture buffer directly (no committed baseline),
 * asserting <2% pixel delta per the Phase 10 verification gate.
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
    test(`${name}: <2% delta vs Loveable`, async ({ browser, baseURL }) => {
      // Capture wishi-app first.
      const wishiCtx = await browser.newContext();
      const wishiPage = await wishiCtx.newPage();
      await wishiPage.goto(`${baseURL}${path}`);
      await waitForReveal(wishiPage);
      const wishiBuffer = await wishiPage.screenshot({ fullPage: true });
      await wishiCtx.close();

      // Capture Loveable at the same viewport.
      const loveCtx = await browser.newContext({
        viewport: wishiPage.viewportSize() ?? undefined,
      });
      const lovePage = await loveCtx.newPage();
      await lovePage.goto(`${loveableBase}${path === "/" ? "" : path}`);
      await waitForReveal(lovePage);
      const loveBuffer = await lovePage.screenshot({ fullPage: true });
      await loveCtx.close();

      // Pixel-diff the two buffers directly.
      const a = PNG.sync.read(wishiBuffer);
      const b = PNG.sync.read(loveBuffer);
      // Pixelmatch requires identical dimensions. Loveable's full-page
      // height varies with content; truncate to the shorter canvas.
      const width = Math.min(a.width, b.width);
      const height = Math.min(a.height, b.height);
      const diff = new PNG({ width, height });
      const diffPixels = pixelmatch(
        cropTo(a, width, height),
        cropTo(b, width, height),
        diff.data,
        width,
        height,
        { threshold: 0.1 },
      );
      const ratio = diffPixels / (width * height);
      expect(ratio, `Loveable ${name} diff ratio`).toBeLessThan(0.02);
    });
  }
}

function cropTo(png: PNG, width: number, height: number): Buffer {
  if (png.width === width && png.height === height) return png.data;
  const out = new PNG({ width, height });
  PNG.bitblt(png, out, 0, 0, width, height, 0, 0);
  return out.data;
}
