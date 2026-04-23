// Checkout burst: 10 concurrent authed users each creating a Stripe
// Checkout session. Requires an E2E test-user cookie with a seeded cart.
//
// Staging setup:
//   1. Seed a test user via `npm run seed:e2e-load-user` (if defined) or
//      hand-create one; populate cart with a couple of direct-sale items.
//   2. Mint the Clerk test session cookie for that user.
//   3. Export:
//        BASE_URL=https://staging-url
//        E2E_CLERK_ID_COOKIE=<cookie-value>
//   4. Run: k6 run tests/load/checkout-burst.js
//
// Does NOT run by default in CI — checkout hits live Stripe and must be
// pointed at a Stripe test-mode key. Phase 11 includes a dedicated manual
// run against staging as part of the cutover checklist.

import http from "k6/http";
import { check, sleep } from "k6";
import { DYNAMIC_PAGE_THRESHOLDS, getBaseUrl } from "./thresholds.js";

export const options = {
  vus: 10,
  duration: "2m",
  thresholds: DYNAMIC_PAGE_THRESHOLDS,
};

const BASE_URL = getBaseUrl();
const COOKIE = __ENV.E2E_CLERK_ID_COOKIE;

if (!COOKIE) {
  throw new Error(
    "E2E_CLERK_ID_COOKIE is required for checkout-burst. See tests/load/checkout-burst.js header.",
  );
}

export default function () {
  const res = http.post(
    `${BASE_URL}/api/payments/checkout`,
    JSON.stringify({ purpose: "DIRECT_SALE" }),
    {
      tags: { route: "dynamic", endpoint: "checkout" },
      headers: {
        "content-type": "application/json",
        cookie: COOKIE,
      },
    },
  );

  check(res, {
    "checkout returns 200 or 303": (r) => r.status === 200 || r.status === 303,
    "has Stripe checkout URL": (r) =>
      r.status === 200
        ? typeof r.json("url") === "string"
        : (r.headers.Location ?? "").includes("checkout.stripe.com"),
  });
  sleep(1 + Math.random() * 2);
}
