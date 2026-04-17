import { prisma } from "@/lib/prisma";
import { createClosetItemsFromOrder } from "@/lib/closet/auto-create";
import type {
  Order,
  OrderItem,
  OrderSource,
  Prisma,
} from "@/generated/prisma/client";

export interface OrderItemInput {
  inventoryProductId: string;
  inventoryListingId?: string;
  title: string;
  brand?: string;
  imageUrl?: string;
  priceInCents: number;
  size?: string;
  color?: string;
  quantity?: number;
}

export interface CreateOrderInput {
  userId: string;
  sessionId?: string;
  source: OrderSource;
  retailer: string;
  totalInCents: number;
  currency?: string;
  items: OrderItemInput[];
}

/**
 * Create an Order (+ OrderItems) atomically and fan out the closet
 * auto-create hook for SELF_REPORTED / AFFILIATE_CONFIRMED sources.
 * DIRECT_SALE orders wait for `markOrderArrived` before auto-creating.
 */
export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        userId: input.userId,
        sessionId: input.sessionId ?? null,
        source: input.source,
        retailer: input.retailer,
        totalInCents: input.totalInCents,
        currency: input.currency ?? "usd",
        items: {
          create: input.items.map((it) => ({
            inventoryProductId: it.inventoryProductId,
            inventoryListingId: it.inventoryListingId ?? null,
            title: it.title,
            brand: it.brand ?? null,
            imageUrl: it.imageUrl ?? null,
            priceInCents: it.priceInCents,
            size: it.size ?? null,
            color: it.color ?? null,
            quantity: it.quantity ?? 1,
          })),
        },
      },
      include: { items: true },
    });
    return created;
  });

  if (input.source === "SELF_REPORTED" || input.source === "AFFILIATE_CONFIRMED") {
    await createClosetItemsFromOrder(order.id);
  }

  return order;
}

/**
 * Upgrade a SELF_REPORTED order to AFFILIATE_CONFIRMED when a commission
 * event proves the self-report. No closet changes — items already auto-created.
 */
export async function upgradeToConfirmed(
  orderId: string,
  merge: { commissionInCents?: number; orderReference?: string } = {},
): Promise<Order> {
  const existing = await prisma.order.findUnique({ where: { id: orderId } });
  if (!existing) throw new Error(`Order ${orderId} not found`);
  if (existing.source === "AFFILIATE_CONFIRMED") return existing;

  return prisma.order.update({
    where: { id: orderId },
    data: {
      source: "AFFILIATE_CONFIRMED",
      totalInCents:
        merge.commissionInCents !== undefined
          ? existing.totalInCents + merge.commissionInCents
          : existing.totalInCents,
    },
  });
}

/**
 * Mark a DIRECT_SALE order as physically arrived. Fires closet auto-create.
 */
export async function markOrderArrived(orderId: string): Promise<Order> {
  const order = await prisma.order.update({
    where: { id: orderId },
    data: { status: "ARRIVED", arrivedAt: new Date() },
  });
  await createClosetItemsFromOrder(orderId);
  return order;
}

export async function getOrderWithItems(
  orderId: string,
): Promise<(Order & { items: OrderItem[] }) | null> {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
}

export async function listOrdersForUser(
  userId: string,
  where: Prisma.OrderWhereInput = {},
): Promise<Order[]> {
  return prisma.order.findMany({
    where: { userId, ...where },
    orderBy: { createdAt: "desc" },
  });
}
