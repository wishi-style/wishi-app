import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ensureUserNamesFromStripe,
  parseFullName,
  __resetEnsureStripeNameCacheForTests,
} from "../src/lib/users/ensure-stripe-name";

function makeRow(overrides: {
  id?: string;
  stripeCustomerId?: string | null;
  firstName?: string;
  lastName?: string;
}) {
  return {
    id: overrides.id ?? "u_1",
    stripeCustomerId:
      "stripeCustomerId" in overrides
        ? (overrides.stripeCustomerId as string | null)
        : "cus_abc",
    firstName: overrides.firstName ?? "",
    lastName: overrides.lastName ?? "",
  };
}

interface FakeStripe {
  customers?: Record<string, string | null>;
  paymentMethods?: Record<string, string | null>;
}

function makeDeps(opts: {
  stripe?: FakeStripe;
  fetchCustomerSpy?: { count: number };
  fetchPmSpy?: { count: number };
  updateSpy?: { calls: Array<{ id: string; firstName: string; lastName: string }> };
} = {}) {
  const stripe = opts.stripe ?? {};
  const fetchCustomerSpy = opts.fetchCustomerSpy ?? { count: 0 };
  const fetchPmSpy = opts.fetchPmSpy ?? { count: 0 };
  const updateSpy = opts.updateSpy ?? { calls: [] };
  return {
    fetchCustomerName: async (customerId: string) => {
      fetchCustomerSpy.count++;
      return stripe.customers?.[customerId] ?? null;
    },
    fetchPaymentMethodName: async (customerId: string) => {
      fetchPmSpy.count++;
      return stripe.paymentMethods?.[customerId] ?? null;
    },
    updateUserName: async (id: string, data: { firstName: string; lastName: string }) => {
      updateSpy.calls.push({ id, ...data });
    },
  };
}

test("parseFullName splits first + last on first space", () => {
  assert.deepEqual(parseFullName("Matt Cardozo"), { firstName: "Matt", lastName: "Cardozo" });
  assert.deepEqual(parseFullName("Mary Jane Watson"), {
    firstName: "Mary",
    lastName: "Jane Watson",
  });
});

test("parseFullName handles single-name strings", () => {
  assert.deepEqual(parseFullName("Cher"), { firstName: "Cher", lastName: "" });
});

test("parseFullName trims surrounding whitespace", () => {
  assert.deepEqual(parseFullName("  Matt   Cardozo  "), {
    firstName: "Matt",
    lastName: "Cardozo",
  });
});

test("parseFullName returns null for null/undefined/empty/whitespace-only", () => {
  assert.equal(parseFullName(null), null);
  assert.equal(parseFullName(undefined), null);
  assert.equal(parseFullName(""), null);
  assert.equal(parseFullName("   "), null);
});

test("populates from Customer.name when present", async () => {
  __resetEnsureStripeNameCacheForTests();
  const row = makeRow({ id: "u_1", stripeCustomerId: "cus_1" });
  const updateSpy = { calls: [] as Array<{ id: string; firstName: string; lastName: string }> };
  await ensureUserNamesFromStripe(
    [row],
    makeDeps({ stripe: { customers: { cus_1: "Matt Cardozo" } }, updateSpy }),
  );
  assert.equal(row.firstName, "Matt");
  assert.equal(row.lastName, "Cardozo");
  assert.deepEqual(updateSpy.calls, [
    { id: "u_1", firstName: "Matt", lastName: "Cardozo" },
  ]);
});

test("falls through to PaymentMethod billing_details when Customer.name is empty", async () => {
  __resetEnsureStripeNameCacheForTests();
  const fetchPmSpy = { count: 0 };
  const row = makeRow({ id: "u_1", stripeCustomerId: "cus_1" });
  await ensureUserNamesFromStripe(
    [row],
    makeDeps({
      stripe: {
        customers: { cus_1: null },
        paymentMethods: { cus_1: "Matt Cardozo" },
      },
      fetchPmSpy,
    }),
  );
  assert.equal(fetchPmSpy.count, 1);
  assert.equal(row.firstName, "Matt");
  assert.equal(row.lastName, "Cardozo");
});

test("treats single-space Customer.name as empty (legacy DB → Stripe push)", async () => {
  __resetEnsureStripeNameCacheForTests();
  const row = makeRow({ id: "u_1", stripeCustomerId: "cus_1" });
  await ensureUserNamesFromStripe(
    [row],
    makeDeps({
      stripe: {
        customers: { cus_1: " " },
        paymentMethods: { cus_1: "Matt Cardozo" },
      },
    }),
  );
  assert.equal(row.firstName, "Matt");
  assert.equal(row.lastName, "Cardozo");
});

test("skips rows that already have a name", async () => {
  __resetEnsureStripeNameCacheForTests();
  const fetchCustomerSpy = { count: 0 };
  const row = makeRow({ id: "u_1", stripeCustomerId: "cus_1", firstName: "Set", lastName: "Already" });
  await ensureUserNamesFromStripe([row], makeDeps({ fetchCustomerSpy }));
  assert.equal(fetchCustomerSpy.count, 0);
});

test("skips rows without a stripeCustomerId", async () => {
  __resetEnsureStripeNameCacheForTests();
  const fetchCustomerSpy = { count: 0 };
  const row = makeRow({ id: "u_1", stripeCustomerId: null });
  await ensureUserNamesFromStripe([row], makeDeps({ fetchCustomerSpy }));
  assert.equal(fetchCustomerSpy.count, 0);
});

test("does not mutate when both Customer and PaymentMethod yield empty", async () => {
  __resetEnsureStripeNameCacheForTests();
  const updateSpy = { calls: [] as Array<{ id: string; firstName: string; lastName: string }> };
  const row = makeRow({ id: "u_1", stripeCustomerId: "cus_1" });
  await ensureUserNamesFromStripe(
    [row],
    makeDeps({
      stripe: {
        customers: { cus_1: null },
        paymentMethods: { cus_1: null },
      },
      updateSpy,
    }),
  );
  assert.equal(row.firstName, "");
  assert.equal(row.lastName, "");
  assert.equal(updateSpy.calls.length, 0);
});

test("Stripe error does not throw or mutate", async () => {
  __resetEnsureStripeNameCacheForTests();
  const row = makeRow({ id: "u_1", stripeCustomerId: "cus_unknown" });
  const deps = makeDeps();
  // Override to throw on first call.
  deps.fetchCustomerName = async () => {
    throw new Error("Stripe API down");
  };
  await assert.doesNotReject(ensureUserNamesFromStripe([row], deps));
  assert.equal(row.firstName, "");
});

test("throttles repeated attempts within TTL window", async () => {
  __resetEnsureStripeNameCacheForTests();
  const fetchCustomerSpy = { count: 0 };
  const deps = makeDeps({
    stripe: { customers: { cus_1: null }, paymentMethods: { cus_1: null } },
    fetchCustomerSpy,
  });
  const r1 = makeRow({ id: "u_1", stripeCustomerId: "cus_1" });
  const r2 = makeRow({ id: "u_1", stripeCustomerId: "cus_1" });
  await ensureUserNamesFromStripe([r1], deps);
  await ensureUserNamesFromStripe([r2], deps);
  assert.equal(fetchCustomerSpy.count, 1, "second call within TTL should be throttled");
});
