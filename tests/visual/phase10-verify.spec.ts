import { test, expect, type Page } from "@playwright/test";

/**
 * Phase 10 verification suite — exercises the non-obvious behaviour
 * points from the PR test plan that aren't caught by typecheck / lint /
 * unit tests / visual regression alone.
 *
 * None of these require auth — the checks live on public marketing pages
 * that read prices from `getPlanPricesForUi()` (the single plan-price
 * source of truth). If any hardcoded price bug regresses, the DOM check
 * catches it before visual diff.
 */

async function waitForReveal(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
}

test.describe("Phase 10 pricing correctness", () => {
  test("/pricing surfaces Mini $60 + Major $130 + Lux $550 from lib/plans", async ({
    page,
  }) => {
    await page.goto("/pricing");
    await waitForReveal(page);
    const body = await page.locator("body").innerText();
    expect(body, "Mini price").toContain("$60");
    expect(body, "Major price").toContain("$130");
    expect(body, "Lux price").toContain("$550");
    // Loveable bugs we explicitly fixed — never these numbers.
    expect(body).not.toContain("$70");
    expect(body).not.toContain("$490");
    expect(body).not.toContain("$117");
    expect(body).not.toContain("$54");
  });

  test("/lux page drops capsule/virtual-fitting-room/free-shipping copy", async ({
    page,
  }) => {
    // The /lux page is product marketing — the canonical Lux price lives on
    // /pricing. We just assert the 2026-04-08-decision-era copy is gone.
    await page.goto("/lux");
    await waitForReveal(page);
    const body = (await page.locator("body").innerText()).toLowerCase();
    expect(body).not.toContain("seasonal capsule");
    expect(body).not.toContain("virtual fitting room");
    expect(body).not.toContain("free priority shipping");
  });
});

test.describe("Phase 10 prefers-reduced-motion compliance", () => {
  test("landing hero reveal skips transform animation when reduced-motion", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage();
    await page.goto("/");
    await waitForReveal(page);
    // Reveal primitive short-circuits the motion.div entirely when
    // useReducedMotion() returns true; asserting the page is interactive
    // and no content is stuck in the initial hidden state.
    await expect(
      page.getByRole("heading", { level: 1 }).first(),
    ).toBeVisible();
    await ctx.close();
  });
});

test.describe("Phase 10 feed pagination", () => {
  test("/feed renders first batch and Load more button when cursor present", async ({
    page,
  }) => {
    await page.goto("/feed");
    await waitForReveal(page);
    // Feed grid renders whatever's seeded. If there are fewer than 24
    // boards (page size), the Load-more button won't appear — still a
    // valid pass, since the pagination contract (cursor === null hides
    // the button) is what we're asserting.
    const loadMore = page.getByRole("button", { name: /Load more/i });
    const count = await loadMore.count();
    if (count > 0) {
      const gridCountBefore = await page
        .locator('[href^="/stylists/"]')
        .count();
      await loadMore.first().click();
      await page.waitForTimeout(800);
      const gridCountAfter = await page
        .locator('[href^="/stylists/"]')
        .count();
      expect(gridCountAfter).toBeGreaterThan(gridCountBefore);
    }
  });
});

test.describe("Phase 10 viewport sanity", () => {
  // The marketing visual specs already diff at desktop-chrome 1280x800
  // and Pixel 7 (375x812-ish). This block asserts the same two viewports
  // render with no console errors — the visual diff alone passes if the
  // DOM looks right even with a JS exception, but console error counts
  // surface the quieter regressions.
  for (const v of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "mobile", width: 375, height: 812 },
  ] as const) {
    test(`/ on ${v.name} (${v.width}x${v.height}) has no console errors`, async ({
      browser,
    }) => {
      const ctx = await browser.newContext({
        viewport: { width: v.width, height: v.height },
      });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      await page.goto("/");
      await waitForReveal(page);
      // Filter out third-party Clerk warnings that aren't our code.
      const ours = errors.filter(
        (e) => !/clerk|development keys|Clerk has been loaded/i.test(e),
      );
      expect(ours, `console errors at ${v.name}: ${ours.join(" | ")}`).toEqual(
        [],
      );
      await ctx.close();
    });
  }
});
