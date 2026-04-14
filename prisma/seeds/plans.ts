import { PrismaClient } from "../../src/generated/prisma/client";

export async function seedPlans(prisma: PrismaClient) {
  const plans = [
    {
      type: "MINI" as const,
      name: "Mini",
      priceInCents: 6000,
      moodboards: 1,
      styleboards: 2,
      payoutTrigger: "SESSION_COMPLETED" as const,
      subscriptionAvailable: true,
      defaultsToSubscription: false,
      trialDays: 3,
      additionalLookPriceCents: 2000,
      description: "Perfect for a quick style refresh — 1 moodboard + 2 styleboards.",
    },
    {
      type: "MAJOR" as const,
      name: "Major",
      priceInCents: 13000,
      moodboards: 1,
      styleboards: 5,
      payoutTrigger: "SESSION_COMPLETED" as const,
      subscriptionAvailable: true,
      defaultsToSubscription: true,
      trialDays: 3,
      additionalLookPriceCents: 2000,
      description: "A full wardrobe overhaul — 1 moodboard + 5 styleboards.",
    },
    {
      type: "LUX" as const,
      name: "Lux",
      priceInCents: 55000,
      moodboards: 1,
      styleboards: 8,
      payoutTrigger: "LUX_THIRD_LOOK" as const,
      luxMilestoneAmountCents: 13500,
      luxMilestoneLookNumber: 3,
      subscriptionAvailable: false,
      defaultsToSubscription: false,
      trialDays: 0,
      additionalLookPriceCents: 2000,
      description:
        "The ultimate styling experience — 1 moodboard + 8 styleboards with milestone payouts.",
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { type: plan.type },
      update: {
        name: plan.name,
        priceInCents: plan.priceInCents,
        moodboards: plan.moodboards,
        styleboards: plan.styleboards,
        payoutTrigger: plan.payoutTrigger,
        luxMilestoneAmountCents: plan.luxMilestoneAmountCents ?? null,
        luxMilestoneLookNumber: plan.luxMilestoneLookNumber ?? null,
        subscriptionAvailable: plan.subscriptionAvailable,
        defaultsToSubscription: plan.defaultsToSubscription,
        trialDays: plan.trialDays,
        additionalLookPriceCents: plan.additionalLookPriceCents,
        description: plan.description,
      },
      create: plan,
    });
  }

  console.log("  ✓ Plans seeded (Mini, Major, Lux)");
}
