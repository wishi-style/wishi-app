import { prisma } from "@/lib/prisma";
import type { Order, OrderItem } from "@/generated/prisma/client";

export const RETURN_WINDOW_DAYS = 14;
export const RETURN_WINDOW_MS = RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export type ClientOrderRow = Order & { items: OrderItem[]; isReturnEligible: boolean };

export function isReturnEligible(order: {
  status: Order["status"];
  arrivedAt: Date | null;
  source: Order["source"];
}, now: Date = new Date()): boolean {
  if (order.source !== "DIRECT_SALE") return false;
  if (order.status !== "ARRIVED") return false;
  if (!order.arrivedAt) return false;
  return now.getTime() - order.arrivedAt.getTime() <= RETURN_WINDOW_MS;
}

export async function listClientOrders(
  userId: string,
  opts: { take?: number; cursor?: string } = {},
): Promise<{ orders: ClientOrderRow[]; nextCursor: string | null }> {
  const take = Math.min(opts.take ?? 20, 100);
  const orders = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: { items: true },
  });

  let nextCursor: string | null = null;
  if (orders.length > take) {
    const next = orders.pop();
    nextCursor = next?.id ?? null;
  }

  const now = new Date();
  return {
    orders: orders.map((o) => ({ ...o, isReturnEligible: isReturnEligible(o, now) })),
    nextCursor,
  };
}

export async function getClientOrder(
  userId: string,
  orderId: string,
): Promise<ClientOrderRow | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order || order.userId !== userId) return null;
  return { ...order, isReturnEligible: isReturnEligible(order) };
}

/**
 * Move a DIRECT_SALE order from ARRIVED → RETURN_IN_PROCESS. Eligibility:
 * the order must be DIRECT_SALE, ARRIVED, and within `RETURN_WINDOW_DAYS` of
 * the arrival date. The actual refund + transition to RETURNED is admin-side.
 * Klaviyo "return-instructions" email + admin task notification fan out from
 * the caller (route handler) so this stays purely transactional.
 */
export async function initiateReturn(
  userId: string,
  orderId: string,
): Promise<Order> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== userId) {
    throw new Error("Order not found");
  }
  if (!isReturnEligible(order)) {
    const reason =
      order.source !== "DIRECT_SALE"
        ? "Only direct-sale orders can be returned through Wishi"
        : order.status !== "ARRIVED"
          ? `Order status ${order.status} is not eligible for return`
          : !order.arrivedAt
            ? "Order has no recorded arrival date and is not eligible for return"
            : `Return window of ${RETURN_WINDOW_DAYS} days has elapsed`;
    throw new Error(reason);
  }

  // Conditional update: if an admin transitions the order between our read
  // and our write (e.g. ARRIVED → RETURN_IN_PROCESS, or back-office cancel),
  // updateMany matches zero rows and we throw rather than silently flipping
  // a now-ineligible order. The arrivedAt window check is duplicated here
  // because this path is finance-sensitive.
  const cutoff = new Date(Date.now() - RETURN_WINDOW_MS);
  const result = await prisma.order.updateMany({
    where: {
      id: orderId,
      userId,
      source: "DIRECT_SALE",
      status: "ARRIVED",
      arrivedAt: { gte: cutoff },
    },
    data: {
      status: "RETURN_IN_PROCESS",
      returnInitiatedAt: new Date(),
    },
  });
  if (result.count === 0) {
    throw new Error("Order is no longer eligible for return");
  }

  const updated = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  return updated;
}
