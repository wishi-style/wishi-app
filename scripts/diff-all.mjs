import { chromium } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const wishiBase = process.env.WISHI_BASE_URL ?? "http://localhost:3100";
const loveBase = process.env.LOVEABLE_BASE_URL ?? "http://localhost:8080";

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
  { path: "/match-quiz", lovePath: "/onboarding", name: "match-quiz" },
  { path: "/stylist-match", name: "stylist-match" },
];

async function settle(page) {
  await page.waitForLoadState("networkidle");
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= h; y += 200) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(50);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
}

function cropTo(png, w, h) {
  if (png.width === w && png.height === h) return png.data;
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(png, out, 0, 0, w, h, 0, 0);
  return out.data;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });

console.log(`route                  | wishi WxH    | love WxH     | ratio  | verdict`);
console.log(`-----------------------|--------------|--------------|--------|--------`);

for (const r of routes) {
  const lovePath = r.lovePath ?? r.path;
  let ratio = null, wDims = "?", lDims = "?", verdict = "?";
  try {
    const pageW = await ctx.newPage();
    await pageW.goto(wishiBase + r.path, { timeout: 30000, waitUntil: "load" });
    await settle(pageW);
    const wBuf = await pageW.screenshot({ fullPage: true });
    const wPng = PNG.sync.read(wBuf);
    wDims = `${wPng.width}x${wPng.height}`;
    await pageW.close();

    const pageL = await ctx.newPage();
    await pageL.goto(loveBase + lovePath, { timeout: 30000, waitUntil: "load" });
    await settle(pageL);
    const lBuf = await pageL.screenshot({ fullPage: true });
    const lPng = PNG.sync.read(lBuf);
    lDims = `${lPng.width}x${lPng.height}`;
    await pageL.close();

    const w = Math.min(wPng.width, lPng.width);
    const h = Math.min(wPng.height, lPng.height);
    const diffPx = pixelmatch(cropTo(wPng, w, h), cropTo(lPng, w, h), null, w, h, { threshold: 0.1 });
    ratio = diffPx / (w * h);
    verdict = ratio < 0.02 ? "PASS" : ratio < 0.10 ? "minor" : ratio < 0.20 ? "MAJOR" : "BLOCKER";
  } catch (e) {
    verdict = "ERR " + (e.message?.slice(0, 30) ?? "");
  }
  const ratioStr = ratio === null ? "—" : (ratio * 100).toFixed(2) + "%";
  console.log(`${r.name.padEnd(22)} | ${wDims.padEnd(12)} | ${lDims.padEnd(12)} | ${ratioStr.padEnd(6)} | ${verdict}`);
}

await browser.close();
