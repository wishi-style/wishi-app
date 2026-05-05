import { expect, test } from "@playwright/test";

/**
 * Regression guard for the 2026-05-05 wishi-staging-alb-5xx-ratio alarm.
 *
 * Failure mode: `src/proxy.ts` matches everything *except* paths ending
 * in static extensions (`.jpg`, `.png`, `.css`, ...), so a request to a
 * missing static asset bypasses `clerkMiddleware`. Next.js then renders
 * the 404 page through the root layout, which mounts
 * `ImpersonationBannerMount`. That component calls `auth()`, and Clerk
 * throws "auth() was called but Clerk can't detect usage of
 * clerkMiddleware()". The throw propagates → 500. With enough broken
 * `<img>` requests in flight (the `LookLibraryPicker` fired 8 at once),
 * the ALB 5xx ratio crosses 1% in a minute and the alarm pages.
 *
 * Two production paths could regress this:
 *   1. `ImpersonationBannerMount` losing its try/catch around `auth()`.
 *   2. Anything else in the root layout calling `auth()` without a
 *      defensive catch.
 *
 * Both surface here as "missing-asset GET returns 500".
 */

test.describe("static-asset 404s never 500", () => {
  for (const path of [
    "/loveable-assets/inspo-1.jpg",
    "/this-file-does-not-exist.jpg",
    "/missing.png",
    "/nope.css",
  ]) {
    test(`GET ${path} returns 404, not 500`, async ({ request }) => {
      const res = await request.get(path, { failOnStatusCode: false });
      expect(
        res.status(),
        `${path} must not 500 — that means clerkMiddleware bypass cascaded into a root-layout auth() throw, which is exactly the regression we're guarding`,
      ).not.toBe(500);
      expect(res.status()).toBe(404);
    });
  }
});
