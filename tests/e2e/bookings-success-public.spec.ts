import { expect, test } from "@playwright/test";

/**
 * Pin Bug #1's fix: /bookings/success must NOT require Clerk auth.
 *
 * Stripe Hosted Checkout redirects clients here over HTTP on staging, and
 * Clerk's Secure session cookies don't always survive the cross-origin
 * redirect — requiring auth here put the page into an infinite Clerk
 * session-refresh loop and surfaced as a permanent white page.
 *
 * The fix moved /bookings/success into the proxy's public-route allowlist
 * and made the page derive its user from the Stripe `session_id` metadata
 * instead of requiring a signed-in Clerk session. This spec asserts the
 * proxy half of that contract: an anonymous request renders the page
 * (or at minimum doesn't 401 / get punted to /sign-in).
 */

test("anonymous request to /bookings/success renders the confirmation page", async ({
  page,
}) => {
  const response = await page.goto("/bookings/success");
  expect(response, "navigation response must exist").not.toBeNull();
  expect(response!.status(), "200 means the proxy let the request through").toBe(200);

  // Did not bounce to Clerk's hosted sign-in or our local /sign-in.
  await expect(page).not.toHaveURL(/\/sign-in/);
  await expect(page).not.toHaveURL(/accounts\.dev/);

  // Page chrome rendered. No session_id → generic "your stylist" copy.
  await expect(
    page.getByRole("heading", { name: /your stylist/i }),
  ).toBeVisible();
  await expect(page.getByText(/Booking confirmed/i)).toBeVisible();

  // Subtitle stays gender-neutral — we don't know the stylist's pronouns.
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/\bshe(?:'|’)ll take/i);
  expect(body).not.toMatch(/\bhe(?:'|’)ll take/i);
});

test("anonymous request to /bookings/success with stale session_id still renders", async ({
  page,
}) => {
  // A bogus session_id mimics the case where the stripe.retrieve fails — we
  // still want the page to render the generic confirmation rather than crash.
  const response = await page.goto(
    "/bookings/success?session_id=cs_test_does_not_exist",
  );
  expect(response!.status()).toBe(200);
  await expect(page).not.toHaveURL(/\/sign-in/);
  await expect(
    page.getByRole("heading", { name: /your stylist/i }),
  ).toBeVisible();
});
