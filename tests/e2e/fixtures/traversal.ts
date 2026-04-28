import { expect, type Page } from "@playwright/test";

/**
 * Failure-guard helpers reused by the traversal specs (anon, authed-client,
 * stylist, admin, error-resilience).
 *
 * Why these exist: the original Phase-10 specs assert that headings render
 * and links carry the right href, but they don't assert the *navigation
 * actually completes without crashing*. The "Meet [Name]" → root error
 * boundary regression slipped through because every existing spec stopped
 * at "is this CTA visible?" — none of them clicked the button and asserted
 * the destination page wasn't replaced by the global error.tsx.
 *
 * `installFailureGuards` registers Playwright listeners that fail the test
 * synchronously on:
 *   - any uncaught client-side JS error (`pageerror`)
 *   - any 5xx HTTP response from the dev server
 *   - any console.error matching the root error-boundary digest pattern
 *
 * `expectNoErrorBoundary` is the body-text assertion every navigation runs
 * after `waitForLoadState("networkidle")` so a render failure surfaces as a
 * test failure on the page that broke, not three steps later.
 */

const ALLOWED_5XX_PATTERNS: RegExp[] = [
  // Twilio media endpoints can transiently 502 in local dev when the dev
  // tenant rate-limits — this is non-blocking for traversal correctness.
  /\.twilio\.com\//,
  /chat\/media/,
];

export function installFailureGuards(page: Page): void {
  page.on("pageerror", (err) => {
    throw new Error(`uncaught pageerror: ${err.message}`);
  });

  page.on("response", (response) => {
    const status = response.status();
    if (status < 500) return;
    const url = response.url();
    if (ALLOWED_5XX_PATTERNS.some((p) => p.test(url))) return;
    // Surface the full request method + URL so failures point at the
    // exact subresource (RSC payload, /_next/image, API route) and not
    // just the page URL the response is associated with.
    const method = response.request().method();
    throw new Error(`5xx response from ${method} ${url} → ${status}`);
  });
}

/**
 * Assert the current page is NOT showing one of the error.tsx boundaries.
 * Matches the body copy from `src/app/error.tsx` ("Something went wrong" /
 * "Try again") and the route-group boundaries under `(client)`, `(stylist)`,
 * `(admin)`. The scoped `stylists/[id]/error.tsx` uses different copy
 * ("We couldn't load this stylist") and is allowed — the error-resilience
 * spec is the only one that asserts on it directly.
 */
export async function expectNoErrorBoundary(page: Page): Promise<void> {
  const body = await page.locator("body").innerText();
  expect(
    body,
    `error.tsx ("Something went wrong") rendered at ${page.url()}`,
  ).not.toMatch(/Something went wrong/i);
  expect(
    body,
    `root retry button rendered at ${page.url()} — likely an unhandled exception bounced to the global boundary`,
  ).not.toContain("Try again");
}

/**
 * Wrapper around `page.goto` that runs the boundary check after the page
 * settles. Use this in traversal specs to keep call sites short.
 */
export async function gotoAndAssertOk(page: Page, path: string): Promise<void> {
  const response = await page.goto(path);
  await page.waitForLoadState("networkidle");
  if (response) {
    expect(
      response.status(),
      `${path} returned ${response.status()}`,
    ).toBeLessThan(500);
  }
  await expectNoErrorBoundary(page);
}
