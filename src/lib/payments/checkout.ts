import { stripe } from "@/lib/stripe";
import { getOrCreateStripeCustomer } from "./stripe-customer";
import { getPlanByType } from "@/lib/plans";
import type { PlanType } from "@/generated/prisma/client";

interface CheckoutOptions {
  userId: string;
  planType: PlanType;
  stylistId?: string;
  stylistUserId?: string;
  successUrl: string;
  cancelUrl: string;
}

export async function createOneTimeCheckout(options: CheckoutOptions) {
  const plan = await getPlanByType(options.planType);
  if (!plan || !plan.stripePriceIdOneTime) {
    throw new Error(`No active plan found for type: ${options.planType}`);
  }

  const customerId = await getOrCreateStripeCustomer(options.userId);

  return stripe.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: [{ price: plan.stripePriceIdOneTime, quantity: 1 }],
    success_url: options.successUrl,
    cancel_url: options.cancelUrl,
    metadata: {
      userId: options.userId,
      planType: options.planType,
      stylistProfileId: options.stylistId ?? "",
      stylistUserId: options.stylistUserId ?? "",
    },
  });
}

export async function createSubscriptionCheckout(options: CheckoutOptions) {
  if (options.planType === "LUX") {
    throw new Error("Lux plan is one-time only — subscriptions are not available");
  }

  const plan = await getPlanByType(options.planType);
  if (!plan || !plan.stripePriceIdSubscription) {
    throw new Error(`No subscription price found for plan: ${options.planType}`);
  }

  const customerId = await getOrCreateStripeCustomer(options.userId);

  return stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: plan.stripePriceIdSubscription, quantity: 1 }],
    subscription_data: {
      trial_period_days: plan.trialDays || undefined,
      metadata: {
        userId: options.userId,
        planType: options.planType,
        stylistProfileId: options.stylistId ?? "",
        stylistUserId: options.stylistUserId ?? "",
      },
    },
    success_url: options.successUrl,
    cancel_url: options.cancelUrl,
    metadata: {
      userId: options.userId,
      planType: options.planType,
      stylistProfileId: options.stylistId ?? "",
      stylistUserId: options.stylistUserId ?? "",
    },
  });
}
