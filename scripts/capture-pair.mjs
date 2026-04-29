import { chromium } from "playwright";

const wishiBase = process.env.WISHI_BASE_URL ?? "http://localhost:3100";
const loveBase = process.env.LOVEABLE_BASE_URL ?? "http://localhost:8081";
const path = process.argv[2] ?? "/";
const lovePath = process.argv[3] ?? path;
const safeName = path.replace(/[^a-z0-9]+/gi, "_") || "root";

async function settle(page, file) {
  await page.waitForLoadState("networkidle");
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= h; y += 200) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(60);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(900);
  await page.screenshot({ path: file, fullPage: true });
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });

const pageW = await ctx.newPage();
await pageW.goto(wishiBase + path, { waitUntil: "networkidle", timeout: 30000 });
await settle(pageW, `/tmp/pair-${safeName}-wishi.png`);

const pageL = await ctx.newPage();
await pageL.goto(loveBase + lovePath, { waitUntil: "networkidle", timeout: 30000 });
await settle(pageL, `/tmp/pair-${safeName}-loveable.png`);

const wH = await pageW.evaluate(() => document.documentElement.scrollHeight);
const lH = await pageL.evaluate(() => document.documentElement.scrollHeight);
console.log(`wishi  ${path}: 1280x${wH}`);
console.log(`loveable ${lovePath}: 1280x${lH}`);

await browser.close();
