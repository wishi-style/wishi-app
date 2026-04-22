// Integration test that hits the REAL Stripe test-mode API. Requires a
// valid STRIPE_SECRET_KEY in .env (sk_test_…). Creates a SESSION promo
// code, retrieves the Coupon from Stripe, asserts the fields round-trip,
// then cleans up (deactivatePromoCode deletes the Stripe Coupon).
//
// Skipped automatically when STRIPE_SECRET_KEY is missing or looks like
// the .env.example placeholder, so CI (which doesn't inject live Stripe
// creds) passes without running this. Run locally with a real sk_test_…
// key to verify the coupon round-trip.

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";

const stripeKey = process.env.STRIPE_SECRET_KEY;
const hasLiveStripeTestKey =
  !!stripeKey && stripeKey.startsWith("sk_test_") && stripeKey !== "sk_test_xxx";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import {
  createPromoCode,
  deactivatePromoCode,
} from "@/lib/promotions/promo-code.service";
import {
  cleanupE2EUserByEmail,
  ensureAdminUser,
} from "./e2e/db";

type User = { id: string; email: string };
const teardown: { user?: User; promoId?: string } = {};

afterEach(async () => {
  if (teardown.promoId) {
    // deactivate also deletes the Stripe Coupon; wrap in a try/catch so a
    // prior failure doesn't block other test teardown.
    try {
      await deactivatePromoCode(teardown.promoId, teardown.user?.id ?? "test");
    } catch {
      /* already deactivated */
    }
    await prisma.auditLog.deleteMany({
      where: { entityType: "PromoCode", entityId: teardown.promoId },
    });
    await prisma.promoCode.deleteMany({ where: { id: teardown.promoId } });
    teardown.promoId = undefined;
  }
  if (teardown.user) {
    await cleanupE2EUserByEmail(teardown.user.email);
    teardown.user = undefined;
  }
});

const skipReason = !hasLiveStripeTestKey
  ? "STRIPE_SECRET_KEY missing — run locally with a real sk_test_ key"
  : undefined;

test("createPromoCode with SESSION type creates a matching Stripe Coupon", { skip: skipReason }, async () => {
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const admin = await ensureAdminUser({
    clerkId: `pc_${suffix}`,
    email: `pc-${suffix.toLowerCase()}@example.com`,
    firstName: "Promo",
    lastName: "Admin",
  });
  teardown.user = admin as User;

  const code = `TEST-${suffix}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const promo = await createPromoCode({
    code,
    creditType: "SESSION",
    amountInCents: 2500,
    usageLimit: 3,
    expiresAt,
    actorUserId: admin.id,
  });
  teardown.promoId = promo.id;

  // Stripe-side assertions — this is the coverage we couldn't do before.
  assert.equal(promo.stripeCouponId, code);
  const coupon = await stripe.coupons.retrieve(code);
  assert.equal(coupon.id, code);
  assert.equal(coupon.amount_off, 2500);
  assert.equal(coupon.currency, "usd");
  assert.equal(coupon.duration, "once");
  assert.equal(coupon.max_redemptions, 3);
  assert.equal(
    coupon.redeem_by,
    Math.floor(expiresAt.getTime() / 1000),
    "redeem_by should be the Unix second of expiresAt",
  );
});

test("createPromoCode with SHOPPING type does NOT touch Stripe", { skip: skipReason }, async () => {
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const admin = await ensureAdminUser({
    clerkId: `pcs_${suffix}`,
    email: `pcs-${suffix.toLowerCase()}@example.com`,
    firstName: "Promo",
    lastName: "Admin",
  });
  teardown.user = admin as User;

  const code = `SHOP-${suffix}`;

  const promo = await createPromoCode({
    code,
    creditType: "SHOPPING",
    amountInCents: 1500,
    actorUserId: admin.id,
  });
  teardown.promoId = promo.id;

  assert.equal(promo.stripeCouponId, null);
  // Verify Stripe has no coupon with this id.
  await assert.rejects(
    () => stripe.coupons.retrieve(code),
    (err: Error) => err.message.includes("No such coupon"),
  );
});
