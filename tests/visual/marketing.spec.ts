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

// `loveablePath` overrides the path used when probing the Loveable dev
// server — only set it when the rebuild renamed the route. The wishi-app
// path is the source of truth for the committed darwin/linux baselines.
const routes = [
  { path: "/", name: "landing" },
  { path: "/pricing", name: "pricing" },
  { path: "/how-it-works", name: "how-it-works" },
  { path: "/lux", name: "lux" },
  { path: "/stylists", name: "stylists" },
  { path: "/feed", name: "feed" },
  { path: "/discover", name: "discover" },
  { path: "/reviews", name: "reviews" },
  { path: "/gift-cards", name: "gift-cards" },
  // `/match-quiz` is the rebuild's rename of Loveable's `/onboarding`.
  { path: "/match-quiz", loveablePath: "/onboarding", name: "match-quiz" },
  // `/stylist-match` is intentionally NOT here — Loveable's `/stylist-match`
  // is the authed top-matches results page. The rebuild renames that route
  // to `/matches` (LOCKED in CLIENT-PIXEL-PARITY-TASK.md). The rebuild's
  // own `/stylist-match` is a Server Component that 307-redirects to
  // `/sign-in` when unauthed and to `/matches` when authed — it has no
  // public-marketing surface to baseline.
] as const;

async function waitForReveal(page: Page) {
  // The `Reveal` primitive uses Motion's `useInView` with `once: true`,
  // so any section that hasn't crossed the viewport yet stays at
  // `opacity: 0, translateY(12px)`. Playwright's `fullPage: true` does
  // NOT scroll the viewport — it expands the capture canvas at the
  // current scroll position. So below-the-fold reveals never fire.
  // Scroll the page through in increments to trigger every observer
  // and unblock lazy-loaded `next/image` content, then return to top
  // and let the 0.7s reveal transition settle before capturing.
  await page.waitForLoadState("networkidle");
  const totalHeight = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  for (let y = 0; y <= totalHeight; y += 200) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(60);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(900);
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
  for (const route of routes) {
    const { path, name } = route;
    const lovePath =
      "loveablePath" in route ? route.loveablePath : path;
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
      await lovePage.goto(`${loveableBase}${lovePath === "/" ? "" : lovePath}`);
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
