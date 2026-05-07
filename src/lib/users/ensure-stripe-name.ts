import { prisma } from "@/lib/prisma";

// Backfill firstName/lastName from a user's Stripe Customer when our DB is
// empty AND Clerk also had nothing. Every Wishi session originates from a
// Stripe checkout (one-time or subscription-create), so any user with a
// `stripeCustomerId` typed a cardholder name into Stripe's hosted page at
// least once — that's the third capture source after Clerk OAuth + the
// post-signup `/settings` edit.
//
// Pulls in this priority order:
//   1. `Customer.name` if non-empty (set on creation OR via
//      `customer_update.name="auto"` on a checkout we ran after PR #128).
//   2. The first card PaymentMethod's `billing_details.name` (always populated
//      from the cardholder name field on Stripe's hosted Checkout page).
//
// A single Stripe `customer.name` was set by `getOrCreateStripeCustomer` to
// `\`${firstName} ${lastName}\`` from the DB at creation time — for users with
// empty DB names that's a single space, which we treat as empty.

interface Row {
  id: string;
  stripeCustomerId: string | null;
  firstName: string;
  lastName: string;
}

export interface EnsureStripeNameDeps {
  fetchCustomerName: (customerId: string) => Promise<string | null>;
  fetchPaymentMethodName: (customerId: string) => Promise<string | null>;
  updateUserName: (
    id: string,
    data: { firstName: string; lastName: string },
  ) => Promise<void>;
}

const ATTEMPT_TTL_MS = 60_000;
const MAX_ATTEMPT_ENTRIES = 5_000;
const recentAttempts = new Map<string, number>();

function shouldAttempt(customerId: string): boolean {
  const now = Date.now();
  const last = recentAttempts.get(customerId);
  if (last !== undefined && now - last < ATTEMPT_TTL_MS) return false;
  if (recentAttempts.size >= MAX_ATTEMPT_ENTRIES) {
    const oldest = [...recentAttempts.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, Math.floor(MAX_ATTEMPT_ENTRIES / 4));
    for (const [k] of oldest) recentAttempts.delete(k);
  }
  recentAttempts.set(customerId, now);
  return true;
}

// Splits "Matt Cardozo" → ("Matt", "Cardozo"); "Mary Jane Watson" →
// ("Mary", "Jane Watson"). Single-name inputs ("Cher") put it all in
// firstName. Strips whitespace; returns null if input has no non-space chars.
export function parseFullName(
  raw: string | null | undefined,
): { firstName: string; lastName: string } | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const idx = trimmed.indexOf(" ");
  if (idx === -1) return { firstName: trimmed, lastName: "" };
  return {
    firstName: trimmed.slice(0, idx),
    lastName: trimmed.slice(idx + 1).trim(),
  };
}

// Mutates `rows` in place: each row whose name was successfully refreshed from
// Stripe has its `firstName`/`lastName` updated. Returns the same array for
// chaining. Failures are logged and swallowed — a Stripe API hiccup must
// never break a stylist dashboard render.
export async function ensureUserNamesFromStripe(
  rows: Row[],
  deps?: EnsureStripeNameDeps,
): Promise<Row[]> {
  const candidates = rows.filter(
    (r) =>
      r.stripeCustomerId &&
      !r.firstName.trim() &&
      !r.lastName.trim() &&
      shouldAttempt(r.stripeCustomerId),
  );
  if (!candidates.length) return rows;

  const resolved = deps ?? (await buildDefaultDeps());

  await Promise.all(
    candidates.map(async (row) => {
      try {
        const customerName = await resolved.fetchCustomerName(row.stripeCustomerId!);
        const fromCustomer = parseFullName(customerName);
        if (fromCustomer && (fromCustomer.firstName || fromCustomer.lastName)) {
          await resolved.updateUserName(row.id, fromCustomer);
          row.firstName = fromCustomer.firstName;
          row.lastName = fromCustomer.lastName;
          return;
        }

        const pmName = await resolved.fetchPaymentMethodName(row.stripeCustomerId!);
        const fromPm = parseFullName(pmName);
        if (fromPm && (fromPm.firstName || fromPm.lastName)) {
          await resolved.updateUserName(row.id, fromPm);
          row.firstName = fromPm.firstName;
          row.lastName = fromPm.lastName;
        }
      } catch (err) {
        console.error(
          JSON.stringify({
            event: "ensure_user_names_from_stripe_failed",
            userId: row.id,
            stripeCustomerId: row.stripeCustomerId,
            err: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }),
  );

  return rows;
}

async function buildDefaultDeps(): Promise<EnsureStripeNameDeps> {
  const { stripe } = await import("@/lib/stripe");
  return {
    fetchCustomerName: async (customerId) => {
      const c = await stripe.customers.retrieve(customerId);
      if (c.deleted) return null;
      return c.name ?? null;
    },
    fetchPaymentMethodName: async (customerId) => {
      const pms = await stripe.paymentMethods.list({
        customer: customerId,
        type: "card",
        limit: 1,
      });
      const first = pms.data[0];
      return first?.billing_details.name ?? null;
    },
    updateUserName: async (id, data) => {
      await prisma.user.update({ where: { id }, data });
    },
  };
}

export function __resetEnsureStripeNameCacheForTests(): void {
  recentAttempts.clear();
}
