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
