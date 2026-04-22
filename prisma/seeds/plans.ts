import Stripe from "stripe";
import { PrismaClient } from "../../src/generated/prisma/client";

type PlanSpec = {
  type: "MINI" | "MAJOR" | "LUX";
  name: string;
  priceInCents: number;
  moodboards: number;
  styleboards: number;
  payoutTrigger: "SESSION_COMPLETED" | "LUX_THIRD_LOOK";
  luxMilestoneAmountCents?: number;
  luxMilestoneLookNumber?: number;
  subscriptionAvailable: boolean;
  defaultsToSubscription: boolean;
  trialDays: number;
  additionalLookPriceCents: number;
  description: string;
};

const PLANS: PlanSpec[] = [
  {
    type: "MINI",
    name: "Mini",
    priceInCents: 6000,
    moodboards: 1,
    styleboards: 2,
    payoutTrigger: "SESSION_COMPLETED",
    subscriptionAvailable: true,
    defaultsToSubscription: false,
    trialDays: 3,
    additionalLookPriceCents: 2000,
    description: "Perfect for a quick style refresh — 1 moodboard + 2 styleboards.",
  },
  {
    type: "MAJOR",
    name: "Major",
    priceInCents: 13000,
    moodboards: 1,
    styleboards: 5,
    payoutTrigger: "SESSION_COMPLETED",
    subscriptionAvailable: true,
    defaultsToSubscription: true,
    trialDays: 3,
    additionalLookPriceCents: 2000,
    description: "A full wardrobe overhaul — 1 moodboard + 5 styleboards.",
  },
  {
    type: "LUX",
    name: "Lux",
    priceInCents: 55000,
    moodboards: 1,
    styleboards: 8,
    payoutTrigger: "LUX_THIRD_LOOK",
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

// Stripe lookup keys give us idempotent create-or-reuse semantics — same key
// on every run resolves to the same Price without creating duplicates. We
// never delete or rotate these in-band; Price objects on Stripe are
// immutable, so changing the amount means creating a new Price (new key).
function oneTimeLookupKey(type: string) {
  return `wishi_${type.toLowerCase()}_one_time`;
}
function subscriptionLookupKey(type: string) {
  return `wishi_${type.toLowerCase()}_subscription_monthly`;
}

async function ensureProductAndPrices(
  stripe: Stripe,
  spec: PlanSpec,
): Promise<{ oneTimeId: string; subscriptionId: string | null }> {
  // Product: one per plan type. Lookup by metadata since Stripe Products
  // don't have lookup_keys — only Prices do.
  const productsPage = await stripe.products.search({
    query: `metadata['wishi_plan_type']:'${spec.type}' AND active:'true'`,
    limit: 1,
  });
  const product =
    productsPage.data[0] ??
    (await stripe.products.create({
      name: `Wishi ${spec.name}`,
      description: spec.description,
      metadata: { wishi_plan_type: spec.type },
    }));

  // One-time Price — resolve by lookup_key.
  const oneTimeKey = oneTimeLookupKey(spec.type);
  const oneTimeList = await stripe.prices.list({
    lookup_keys: [oneTimeKey],
    active: true,
    limit: 1,
  });
  const oneTime =
    oneTimeList.data[0] ??
    (await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: spec.priceInCents,
      lookup_key: oneTimeKey,
      metadata: { wishi_plan_type: spec.type, wishi_mode: "one_time" },
    }));

  // Subscription Price (monthly) — only for plans that support it.
  let subscriptionId: string | null = null;
  if (spec.subscriptionAvailable) {
    const subKey = subscriptionLookupKey(spec.type);
    const subList = await stripe.prices.list({
      lookup_keys: [subKey],
      active: true,
      limit: 1,
    });
    const sub =
      subList.data[0] ??
      (await stripe.prices.create({
        product: product.id,
        currency: "usd",
        unit_amount: spec.priceInCents,
        recurring: { interval: "month" },
        lookup_key: subKey,
        metadata: { wishi_plan_type: spec.type, wishi_mode: "subscription" },
      }));
    subscriptionId = sub.id;
  }

  return { oneTimeId: oneTime.id, subscriptionId };
}

export async function seedPlans(prisma: PrismaClient) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const stripe = stripeKey
    ? new Stripe(stripeKey, { typescript: true })
    : null;

  for (const spec of PLANS) {
    const ids = stripe
      ? await ensureProductAndPrices(stripe, spec)
      : { oneTimeId: null, subscriptionId: null };

    await prisma.plan.upsert({
      where: { type: spec.type },
      update: {
        name: spec.name,
        priceInCents: spec.priceInCents,
        moodboards: spec.moodboards,
        styleboards: spec.styleboards,
        payoutTrigger: spec.payoutTrigger,
        luxMilestoneAmountCents: spec.luxMilestoneAmountCents ?? null,
        luxMilestoneLookNumber: spec.luxMilestoneLookNumber ?? null,
        subscriptionAvailable: spec.subscriptionAvailable,
        defaultsToSubscription: spec.defaultsToSubscription,
        trialDays: spec.trialDays,
        additionalLookPriceCents: spec.additionalLookPriceCents,
        description: spec.description,
        // Only overwrite Stripe IDs when the seeder actually resolved them —
        // running locally without STRIPE_SECRET_KEY must not wipe existing
        // IDs that a previous run (or staging) wrote.
        ...(ids.oneTimeId !== null
          ? { stripePriceIdOneTime: ids.oneTimeId }
          : {}),
        ...(ids.subscriptionId !== null
          ? { stripePriceIdSubscription: ids.subscriptionId }
          : {}),
      },
      create: {
        ...spec,
        luxMilestoneAmountCents: spec.luxMilestoneAmountCents ?? null,
        luxMilestoneLookNumber: spec.luxMilestoneLookNumber ?? null,
        stripePriceIdOneTime: ids.oneTimeId,
        stripePriceIdSubscription: ids.subscriptionId,
      },
    });
  }

  const resolved = stripe ? "with Stripe Price IDs" : "without Stripe IDs (STRIPE_SECRET_KEY not set — bookings will fail until backfilled)";
  console.log(`  ✓ Plans seeded ${resolved} (Mini, Major, Lux)`);
}
