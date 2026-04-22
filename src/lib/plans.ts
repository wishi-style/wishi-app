import { prisma } from "@/lib/prisma";
import type { PlanType } from "@/generated/prisma/client";

export async function getActivePlans() {
  return prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { priceInCents: "asc" },
  });
}

export async function getPlanByType(type: PlanType) {
  return prisma.plan.findUnique({ where: { type } });
}

export type PlanPricesForUi = {
  mini: { priceInCents: number; displayDollars: number };
  major: { priceInCents: number; displayDollars: number };
  lux: { priceInCents: number; displayDollars: number };
  additionalLookInCents: number;
  additionalLookDollars: number;
  luxMilestoneInCents: number | null;
  luxMilestoneLookNumber: number | null;
  currency: string;
};

export async function getPlanPricesForUi(): Promise<PlanPricesForUi> {
  const plans = await prisma.plan.findMany({
    where: { isActive: true, type: { in: ["MINI", "MAJOR", "LUX"] } },
  });

  const byType = new Map(plans.map((p) => [p.type, p]));
  const mini = byType.get("MINI");
  const major = byType.get("MAJOR");
  const lux = byType.get("LUX");

  if (!mini || !major || !lux) {
    throw new Error(
      "Plans table missing MINI/MAJOR/LUX rows — run `npx tsx prisma/seed.ts`"
    );
  }

  return {
    mini: toDisplay(mini.priceInCents),
    major: toDisplay(major.priceInCents),
    lux: toDisplay(lux.priceInCents),
    additionalLookInCents: mini.additionalLookPriceCents,
    additionalLookDollars: centsToDollars(mini.additionalLookPriceCents),
    luxMilestoneInCents: lux.luxMilestoneAmountCents,
    luxMilestoneLookNumber: lux.luxMilestoneLookNumber,
    currency: mini.currency,
  };
}

function toDisplay(priceInCents: number) {
  return { priceInCents, displayDollars: centsToDollars(priceInCents) };
}

function centsToDollars(cents: number) {
  return Math.round(cents / 100);
}
