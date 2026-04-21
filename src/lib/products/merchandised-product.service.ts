import { prisma } from "@/lib/prisma";
import type { MerchandisedProduct } from "@/generated/prisma/client";

export async function getMerchandised(
  inventoryProductIds: string[],
): Promise<Map<string, MerchandisedProduct>> {
  if (inventoryProductIds.length === 0) return new Map();
  const rows = await prisma.merchandisedProduct.findMany({
    where: { inventoryProductId: { in: inventoryProductIds } },
  });
  return new Map(rows.map((r) => [r.inventoryProductId, r]));
}

export async function isDirectSale(
  inventoryProductId: string,
): Promise<boolean> {
  const row = await prisma.merchandisedProduct.findUnique({
    where: { inventoryProductId },
  });
  return row?.isDirectSale ?? false;
}

export async function setDirectSale(
  inventoryProductId: string,
  isDirectSale: boolean,
  adminNotes?: string,
): Promise<MerchandisedProduct> {
  return prisma.merchandisedProduct.upsert({
    where: { inventoryProductId },
    update: { isDirectSale, adminNotes: adminNotes ?? null },
    create: {
      inventoryProductId,
      isDirectSale,
      adminNotes: adminNotes ?? null,
    },
  });
}

export async function listDirectSale(): Promise<MerchandisedProduct[]> {
  return prisma.merchandisedProduct.findMany({
    where: { isDirectSale: true },
    orderBy: { updatedAt: "desc" },
  });
}
