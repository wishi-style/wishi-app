import { prisma } from "@/lib/prisma";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { transitionOrderItemStatus } from "@/lib/orders/admin-orders.service";
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

  await dispatchNotification({
    event: "order.return_initiated",
    userId,
    title: "Return started",
    body: "We'll email return instructions shortly. Pack up the item and ship it back within 7 days.",
    url: `/orders/${orderId}`,
    emailProperties: {
      orderId,
      totalInCents: updated.totalInCents,
      returnInitiatedAt: updated.returnInitiatedAt?.toISOString() ?? null,
    },
  }).catch((err) => {
    console.warn(`[orders] order.return_initiated dispatch failed for ${orderId}:`, err);
  });

  return updated;
}

/**
 * Per-OrderItem retailer-mirror return.
 *
 * In the universal-fulfillment model, the user returns the item DIRECTLY
 * to the retailer (the retailer's return label arrived in the shipping
 * email since we used the user's email at retailer checkout). Wishi
 * mirrors the refund onto the user's Stripe charge once the user submits
 * the retailer return reference (number / receipt URL) here and an admin
 * confirms the retailer refund landed.
 *
 * Eligibility: the OrderItem must be PURCHASED, the parent Order must be
 * owned by the caller, and the parent must be DIRECT_SALE. No 14-day
 * Wishi-side window — retailer return policies vary; admin verifies
 * before mirroring the refund.
 */
export async function requestRetailerReturnForOrderItem(
  userId: string,
  orderItemId: string,
  receiptRef: string,
): Promise<OrderItem> {
  const trimmed = receiptRef.trim();
  if (!trimmed) throw new Error("Retailer return reference is required");
  if (trimmed.length > 500) {
    throw new Error("Retailer return reference is too long (max 500 chars)");
  }

  const item = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    include: { order: true },
  });
  if (!item || item.order.userId !== userId) {
    throw new Error("Order item not found");
  }
  if (item.order.source !== "DIRECT_SALE") {
    throw new Error("Only Wishi-fulfilled items can mirror a retailer refund");
  }
  if (item.status !== "PURCHASED") {
    throw new Error(
      `Item is in state ${item.status}; only PURCHASED items can request a retailer return`,
    );
  }

  const result = await transitionOrderItemStatus(orderItemId, "RETURN_REQUESTED", {
    returnReceiptRef: trimmed,
  });

  await dispatchNotification({
    event: "order.return_initiated",
    userId,
    title: "Return submitted",
    body: `We'll mirror your ${item.retailerName ?? "retailer"} refund once it lands.`,
    url: `/orders/${item.order.id}`,
    emailProperties: {
      orderId: item.order.id,
      orderItemId,
      retailerName: item.retailerName,
      returnReceiptRef: trimmed,
    },
  }).catch((err) => {
    console.warn(
      `[orders] retailer return notification failed for ${orderItemId}:`,
      err,
    );
  });

  return result.orderItem;
}
