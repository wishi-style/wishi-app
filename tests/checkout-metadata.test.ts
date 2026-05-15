import assert from "node:assert/strict";
import test from "node:test";

import { retrieveCheckoutMetadata } from "@/lib/payments/checkout-metadata";

function makeDeps(overrides: {
  metadata?: Record<string, string | null> | null;
  shouldThrow?: boolean;
} = {}) {
  return {
    retrieveCheckoutSession: async () => {
      if (overrides.shouldThrow) throw new Error("stripe boom");
      const metadata =
        "metadata" in overrides
          ? overrides.metadata
          : { userId: "user_abc", stylistUserId: "stylist_abc" };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { metadata } as any;
    },
  };
}

test("returns null when stripeSessionId is missing", async () => {
  const result = await retrieveCheckoutMetadata({
    stripeSessionId: undefined,
    deps: makeDeps(),
  });
  assert.equal(result, null);
});

test("returns null when stripeSessionId is the literal placeholder", async () => {
  const result = await retrieveCheckoutMetadata({
    stripeSessionId: "{CHECKOUT_SESSION_ID}",
    deps: makeDeps(),
  });
  assert.equal(result, null);
});

test("returns null when Stripe retrieve throws", async () => {
  const result = await retrieveCheckoutMetadata({
    stripeSessionId: "cs_test_xyz",
    deps: makeDeps({ shouldThrow: true }),
  });
  assert.equal(result, null);
});

test("returns nulls for absent metadata keys", async () => {
  const result = await retrieveCheckoutMetadata({
    stripeSessionId: "cs_test_xyz",
    deps: makeDeps({ metadata: {} }),
  });
  assert.deepEqual(result, { prismaUserId: null, stylistUserId: null });
});

test("returns nulls when metadata is null", async () => {
  const result = await retrieveCheckoutMetadata({
    stripeSessionId: "cs_test_xyz",
    deps: makeDeps({ metadata: null }),
  });
  assert.deepEqual(result, { prismaUserId: null, stylistUserId: null });
});

test("ignores empty-string metadata values", async () => {
  const result = await retrieveCheckoutMetadata({
    stripeSessionId: "cs_test_xyz",
    deps: makeDeps({ metadata: { userId: "", stylistUserId: "" } }),
  });
  assert.deepEqual(result, { prismaUserId: null, stylistUserId: null });
});

test("extracts both userId and stylistUserId", async () => {
  const result = await retrieveCheckoutMetadata({
    stripeSessionId: "cs_test_xyz",
    deps: makeDeps({
      metadata: { userId: "user_abc", stylistUserId: "stylist_xyz" },
    }),
  });
  assert.deepEqual(result, {
    prismaUserId: "user_abc",
    stylistUserId: "stylist_xyz",
  });
});

test("extracts userId without stylistUserId (e.g. waitlist signup)", async () => {
  const result = await retrieveCheckoutMetadata({
    stripeSessionId: "cs_test_xyz",
    deps: makeDeps({ metadata: { userId: "user_abc" } }),
  });
  assert.deepEqual(result, {
    prismaUserId: "user_abc",
    stylistUserId: null,
  });
});
