import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import {
  createOneTimeCheckout,
  createSubscriptionCheckout,
} from "@/lib/payments/checkout";
import { provisionSessionForE2E } from "@/lib/payments/e2e-provision-session";
import { hasActiveSessionWithStylist } from "@/lib/sessions/queries";
import type { PlanType } from "@/generated/prisma/client";

export type CheckoutOutcome =
  | { kind: "redirect-to-active-session" }
  | { kind: "e2e-provisioned"; sessionId: string }
  | { kind: "redirect-to-stripe"; url: string };

export interface RunCheckoutInput {
  auth: { userId: string | null; isE2E: boolean };
  formData: FormData;
  appUrl: string;
  // Test seams: integration tests pass fakes so we can prove the discriminator
  // without hitting Stripe. Production callers omit these.
  deps?: {
    provisionSessionForE2E?: typeof provisionSessionForE2E;
    createOneTimeCheckout?: (
      opts: Parameters<typeof createOneTimeCheckout>[0],
    ) => Promise<Pick<Stripe.Checkout.Session, "id" | "url">>;
    createSubscriptionCheckout?: (
      opts: Parameters<typeof createSubscriptionCheckout>[0],
    ) => Promise<Pick<Stripe.Checkout.Session, "id" | "url">>;
  };
}

/**
 * Pure(ish) implementation of the booking-checkout server action. Extracted
 * here so unit tests can drive both branches (e2e bypass vs Stripe Hosted)
 * without going through the Next form-action runtime. The thin wrapper at
 * `src/app/(client)/bookings/new/actions.ts` captures auth + appUrl and maps
 * the outcome to a `redirect()`.
 *
 * Critically, the e2e bypass is gated on `auth.isE2E` (per-request, set by
 * the /sign-in?e2e=1 backdoor), NOT on the `E2E_AUTH_MODE` env flag. Staging
 * runs with the env flag on so Playwright works, but real Clerk signups on
 * staging must still hit Stripe — otherwise every staging signup gets a free
 * synthetic SUCCEEDED Payment row.
 */
export async function runCheckout({
  auth,
  formData,
  appUrl,
  deps,
}: RunCheckoutInput): Promise<CheckoutOutcome> {
  if (!auth.userId) throw new Error("Not authenticated");

  const user = await prisma.user.findUnique({
    where: { clerkId: auth.userId },
    select: { id: true },
  });
  if (!user) throw new Error("User not found");

  const planType = formData.get("planType") as PlanType;
  const stylistProfileId =
    (formData.get("stylistId") as string) || undefined;
  const isSubscription = formData.get("isSubscription") === "true";

  if (!planType || !["MINI", "MAJOR", "LUX"].includes(planType)) {
    throw new Error("Invalid plan type");
  }
  if (isSubscription && planType === "LUX") {
    throw new Error("Lux plan is one-time only");
  }

  let stylistUserId: string | undefined;
  if (stylistProfileId) {
    const profile = await prisma.stylistProfile.findUnique({
      where: { id: stylistProfileId },
      select: { userId: true },
    });
    if (!profile) throw new Error("Stylist not found");
    stylistUserId = profile.userId;

    const hasActive = await hasActiveSessionWithStylist(
      user.id,
      stylistProfileId,
    );
    if (hasActive) return { kind: "redirect-to-active-session" };
  }

  if (auth.isE2E) {
    const provision = deps?.provisionSessionForE2E ?? provisionSessionForE2E;
    const result = await provision({
      userId: user.id,
      planType,
      stylistUserId,
      isSubscription,
    });
    return { kind: "e2e-provisioned", sessionId: result.sessionId };
  }

  const stripeOptions = {
    userId: user.id,
    planType,
    stylistId: stylistProfileId,
    stylistUserId,
    successUrl: `${appUrl}/bookings/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl}/bookings/new${stylistProfileId ? `?stylistId=${stylistProfileId}` : ""}`,
  };

  const oneTime = deps?.createOneTimeCheckout ?? createOneTimeCheckout;
  const subscription =
    deps?.createSubscriptionCheckout ?? createSubscriptionCheckout;
  const session = isSubscription
    ? await subscription(stripeOptions)
    : await oneTime(stripeOptions);

  if (!session.url) throw new Error("Failed to create checkout session");
  return { kind: "redirect-to-stripe", url: session.url };
}
