import { expect, test } from "@playwright/test";

/**
 * Pin the public render contract for /bookings/success.
 *
 * Why the page is still public: Stripe Hosted Checkout bounces the user back
 * here as a cross-origin top-level GET. Clerk's short-lived JWT often expires
 * during the 1–3 minutes the user spends on Stripe, and for brand-new signups
 * the long-lived refresh cookie isn't always fully persisted before the modal
 * closes and `forceRedirectUrl` fires. Gating the page on Clerk auth would
 * 401 those users and lose the booking confirmation chrome.
 *
 * Instead, the page runs a server-side auto-recovery (see
 * `src/lib/auth/clerk-recovery.ts`) — when no Clerk session is present, it
 * mints a one-shot signInToken off the Stripe `session_id` metadata and
 * bounces through `/sign-in?__clerk_ticket=...` so Clerk's <SignIn> component
 * silently re-authenticates the user. When recovery is impossible (no
 * session_id, stale id, missing metadata, Clerk/Stripe outage), the page
 * falls back to the generic confirmation render asserted below. The recovery
 * URL builder itself is unit-tested in `tests/clerk-recovery.test.ts`.
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

test("recovery loop guard: __clerk_recovery=tried short-circuits to the generic page", async ({
  page,
}) => {
  // Second-time-through marker — set after Clerk's ticket exchange ran but
  // didn't restore a session (rare). The page MUST NOT attempt recovery
  // again or we'd ping-pong forever. Instead it renders the generic
  // confirmation immediately.
  const response = await page.goto(
    "/bookings/success?session_id=cs_test_does_not_exist&__clerk_recovery=tried",
  );
  expect(response!.status()).toBe(200);
  await expect(page).not.toHaveURL(/\/sign-in/);
  await expect(page).toHaveURL(/__clerk_recovery=tried/);
  await expect(
    page.getByRole("heading", { name: /your stylist/i }),
  ).toBeVisible();
  await expect(page.getByText(/Booking confirmed/i)).toBeVisible();
});
