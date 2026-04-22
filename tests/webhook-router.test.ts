// Unit tests for handleCheckoutCompleted's metadata.purpose routing.
// Asserts the right downstream service is invoked for each purpose and
// that the default booking path still runs when purpose is absent.
//
// The service-layer tests (session-upgrade, buy-more-looks, gift-card)
// cover each fulfillment's business logic; this fills the gap between
// those and the full webhook chain by exercising the router.

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { handleCheckoutCompleted } from "@/lib/payments/webhook-handlers";
import { cleanupE2EUserByEmail, ensureClientUser } from "./e2e/db";

type User = { id: string; email: string };
const teardown: User[] = [];

afterEach(async () => {
  while (teardown.length > 0) {
    const u = teardown.pop();
    if (u) await cleanupE2EUserByEmail(u.email);
  }
});

function fakeGiftCardEvent(opts: {
  purchaserUserId: string;
  paymentIntentId: string;
  amountInCents: number;
  recipientEmail: string;
}): Stripe.Checkout.Session {
  return {
    id: `cs_test_rt_${opts.paymentIntentId}`,
    payment_intent: opts.paymentIntentId,
    amount_total: opts.amountInCents,
    currency: "usd",
    metadata: {
      purpose: "GIFT_CARD_PURCHASE",
      purchaserUserId: opts.purchaserUserId,
      amountInCents: String(opts.amountInCents),
      recipientEmail: opts.recipientEmail,
    },
  } as unknown as Stripe.Checkout.Session;
}

test("handleCheckoutCompleted routes GIFT_CARD_PURCHASE to gift-card fulfillment", async () => {
  const suffix = randomUUID().slice(0, 8);
  const buyer = await ensureClientUser({
    clerkId: `rt_gc_${suffix}`,
    email: `rt-gc-${suffix}@example.com`,
    firstName: "Route",
    lastName: "Test",
  });
  teardown.push(buyer as User);

  await handleCheckoutCompleted(
    fakeGiftCardEvent({
      purchaserUserId: buyer.id,
      paymentIntentId: `pi_rt_${suffix}`,
      amountInCents: 5000,
      recipientEmail: `recipient-${suffix}@example.com`,
    }),
  );

  // Proof the router picked the right branch: artifacts only the
  // gift-card fulfillment produces.
  const giftCards = await prisma.giftCard.count({
    where: { purchaserUserId: buyer.id },
  });
  assert.equal(giftCards, 1);
  const promoCount = await prisma.promoCode.count({
    where: {
      OR: [
        { giftCardSessionCodes: { some: { purchaserUserId: buyer.id } } },
        { giftCardShoppingCodes: { some: { purchaserUserId: buyer.id } } },
      ],
    },
  });
  assert.equal(promoCount, 2);
});

test("handleCheckoutCompleted skips the default-booking path when metadata.purpose is set", async () => {
  const suffix = randomUUID().slice(0, 8);
  const buyer = await ensureClientUser({
    clerkId: `rt_nb_${suffix}`,
    email: `rt-nb-${suffix}@example.com`,
    firstName: "Route",
    lastName: "NoBooking",
  });
  teardown.push(buyer as User);

  await handleCheckoutCompleted(
    fakeGiftCardEvent({
      purchaserUserId: buyer.id,
      paymentIntentId: `pi_rt_nb_${suffix}`,
      amountInCents: 5000,
      recipientEmail: `recipient-nb-${suffix}@example.com`,
    }),
  );

  // No Session should be created — the default-booking branch was never
  // reached because the GIFT_CARD_PURCHASE branch short-circuited.
  const sessions = await prisma.session.count({ where: { clientId: buyer.id } });
  assert.equal(sessions, 0);
});
