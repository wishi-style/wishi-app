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

// Stripe lookup keys give us idempotent create-or-reuse semantics. We encode
// the amount into the key (`wishi_mini_one_time_6000c`) so a price change
// yields a new key → a new Price object, rather than silently reusing the
// old-amount Price. Stripe Price objects are immutable, so bumping the key
// is the only way to propagate a new amount.
function oneTimeLookupKey(spec: PlanSpec) {
  return `wishi_${spec.type.toLowerCase()}_one_time_${spec.priceInCents}c`;
}
function subscriptionLookupKey(spec: PlanSpec) {
  return `wishi_${spec.type.toLowerCase()}_subscription_monthly_${spec.priceInCents}c`;
}

// Pick a Price that matches spec (currency + amount + recurring mode). Stripe
// technically allows multiple active Prices sharing a lookup_key, so we can't
// blindly trust `limit: 1` — filter explicitly so the seed stays correct even
// if someone created a duplicate out-of-band.
function pickMatchingPrice(
  prices: Stripe.Price[],
  spec: PlanSpec,
  mode: "one_time" | "subscription",
  productId: string,
): Stripe.Price | undefined {
  return prices.find((p) => {
    if (p.product !== productId) return false;
    if (p.currency !== "usd") return false;
    if (p.unit_amount !== spec.priceInCents) return false;
    if (mode === "one_time") return p.recurring === null;
    return p.recurring?.interval === "month";
  });
}

async function ensureProductAndPrices(
  stripe: Stripe,
  spec: PlanSpec,
): Promise<{
  productId: string;
  oneTimeId: string;
  subscriptionId: string | null;
}> {
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

  // One-time Price. List all Prices with the lookup_key (there should be at
  // most one but we defend against duplicates), pick the one that matches
  // spec, or create a new Price if none match.
  const oneTimeKey = oneTimeLookupKey(spec);
  const oneTimeList = await stripe.prices.list({
    lookup_keys: [oneTimeKey],
    active: true,
    limit: 10,
  });
  const oneTime =
    pickMatchingPrice(oneTimeList.data, spec, "one_time", product.id) ??
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
    const subKey = subscriptionLookupKey(spec);
    const subList = await stripe.prices.list({
      lookup_keys: [subKey],
      active: true,
      limit: 10,
    });
    const sub =
      pickMatchingPrice(subList.data, spec, "subscription", product.id) ??
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

  return { productId: product.id, oneTimeId: oneTime.id, subscriptionId };
}

export async function seedPlans(prisma: PrismaClient) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const stripe = stripeKey
    ? new Stripe(stripeKey, { typescript: true })
    : null;

  for (const spec of PLANS) {
    const ids = stripe
      ? await ensureProductAndPrices(stripe, spec)
      : { productId: null, oneTimeId: null, subscriptionId: null };

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
        ...(ids.productId !== null
          ? { stripeProductId: ids.productId }
          : {}),
        ...(ids.oneTimeId !== null
          ? { stripePriceIdOneTime: ids.oneTimeId }
          : {}),
        ...(stripe && !spec.subscriptionAvailable
          ? // Plan flipped to subscription-ineligible: clear any stale ID so
            // the DB stays consistent with spec.subscriptionAvailable.
            { stripePriceIdSubscription: null }
          : ids.subscriptionId !== null
            ? { stripePriceIdSubscription: ids.subscriptionId }
            : {}),
      },
      create: {
        ...spec,
        luxMilestoneAmountCents: spec.luxMilestoneAmountCents ?? null,
        luxMilestoneLookNumber: spec.luxMilestoneLookNumber ?? null,
        stripeProductId: ids.productId,
        stripePriceIdOneTime: ids.oneTimeId,
        stripePriceIdSubscription: ids.subscriptionId,
      },
    });
  }

  const resolved = stripe
    ? "with Stripe Product + Price IDs"
    : "without Stripe IDs (STRIPE_SECRET_KEY not set — bookings will fail until backfilled)";
  console.log(`  ✓ Plans seeded ${resolved} (Mini, Major, Lux)`);
}
