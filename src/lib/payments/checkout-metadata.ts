import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";

export interface CheckoutMetadata {
  /** `metadata.userId` from the Stripe Checkout — points at `User.id` (Prisma). */
  prismaUserId: string | null;
  /** `metadata.stylistUserId` — points at the stylist `User.id` (Prisma). */
  stylistUserId: string | null;
}

export interface RetrieveCheckoutMetadataInput {
  stripeSessionId: string | null | undefined;
  // Test seam. Production omits this.
  deps?: {
    retrieveCheckoutSession?: (id: string) => Promise<
      Pick<Stripe.Checkout.Session, "metadata">
    >;
  };
}

/**
 * Single source of truth for "given a Stripe `session_id` from `/bookings/success`,
 * what user IDs does the metadata point at?".
 *
 * Hoisted out of `buildClerkRecoveryUrl` + `resolveFromCheckout` so we don't
 * call `stripe.checkout.sessions.retrieve` twice on the unhappy path (no Clerk
 * session + recovery falls through to the generic confirmation render).
 *
 * Returns `null` for any case where retrieval isn't possible or fails — the
 * caller should degrade gracefully rather than 500. Errors are swallowed
 * silently here because the error surface for the recovery path lives in
 * `buildClerkRecoveryUrl`'s log; this helper is a pure data-fetch.
 */
export async function retrieveCheckoutMetadata({
  stripeSessionId,
  deps,
}: RetrieveCheckoutMetadataInput): Promise<CheckoutMetadata | null> {
  if (!stripeSessionId || stripeSessionId === "{CHECKOUT_SESSION_ID}") {
    return null;
  }

  try {
    const retrieve =
      deps?.retrieveCheckoutSession ??
      ((id: string) => stripe.checkout.sessions.retrieve(id));
    const session = await retrieve(stripeSessionId);
    return {
      prismaUserId: readString(session.metadata, "userId"),
      stylistUserId: readString(session.metadata, "stylistUserId"),
    };
  } catch {
    return null;
  }
}

function readString(
  metadata: Stripe.Metadata | null | undefined,
  key: string,
): string | null {
  if (!metadata) return null;
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
