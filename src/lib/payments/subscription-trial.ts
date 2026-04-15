import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export async function endTrialEarly(subscriptionId: string) {
  const sub = await prisma.subscription.findUniqueOrThrow({
    where: { id: subscriptionId },
  });

  if (sub.status !== "TRIALING") {
    return;
  }

  await stripe.subscriptions.update(sub.stripeSubscriptionId, {
    trial_end: "now",
  });
}
