import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { createClosetItemsFromOrder } from "@/lib/closet/auto-create";
import type { Order, OrderItem, OrderSource, OrderStatus } from "@/generated/prisma/client";

export const REFUND_SOFT_CAP_CENTS = 20_000; // $200 — surfaces a manager-approval warning

/** Pure helper: returns the soft-cap warning string when over threshold, else null. */
export function refundSoftCapWarning(amountInCents: number): string | null {
  return amountInCents > REFUND_SOFT_CAP_CENTS
    ? `Refund exceeds soft cap of $${(REFUND_SOFT_CAP_CENTS / 100).toFixed(0)} — manager approval recommended.`
    : null;
}

export type AdminOrderRow = {
  id: string;
  source: OrderSource;
  status: OrderStatus;
  retailer: string;
  totalInCents: number;
  taxInCents: number;
  shippingInCents: number;
  isPriorityShipping: boolean;
  trackingNumber: string | null;
  carrier: string | null;
  clientName: string;
  clientEmail: string;
  itemCount: number;
  createdAt: Date;
};

export async function listAdminOrders(filter?: {
  source?: OrderSource;
  status?: OrderStatus;
  take?: number;
}): Promise<AdminOrderRow[]> {
  const rows = await prisma.order.findMany({
    where: { source: filter?.source, status: filter?.status },
    orderBy: { createdAt: "desc" },
    take: filter?.take ?? 200,
    select: {
      id: true,
      source: true,
      status: true,
      retailer: true,
      totalInCents: true,
      taxInCents: true,
      shippingInCents: true,
      isPriorityShipping: true,
      trackingNumber: true,
      carrier: true,
      createdAt: true,
      user: { select: { firstName: true, lastName: true, email: true } },
      _count: { select: { items: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    status: r.status,
    retailer: r.retailer,
    totalInCents: r.totalInCents,
    taxInCents: r.taxInCents,
    shippingInCents: r.shippingInCents,
    isPriorityShipping: r.isPriorityShipping,
    trackingNumber: r.trackingNumber,
    carrier: r.carrier,
    clientName: `${r.user.firstName} ${r.user.lastName}`,
    clientEmail: r.user.email,
    itemCount: r._count.items,
    createdAt: r.createdAt,
  }));
}

export async function getAdminOrderDetail(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      session: { select: { id: true, planType: true, status: true } },
    },
  });
}

export type AdminOrderDetail = NonNullable<Awaited<ReturnType<typeof getAdminOrderDetail>>>;

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["ORDERED"],
  ORDERED: ["SHIPPED"],
  SHIPPED: ["ARRIVED"],
  ARRIVED: ["RETURN_IN_PROCESS"],
  RETURN_IN_PROCESS: ["RETURNED"],
  RETURNED: [],
};

export function nextAllowedStatuses(current: OrderStatus): OrderStatus[] {
  return STATUS_TRANSITIONS[current] ?? [];
}

export async function setOrderTracking(
  orderId: string,
  input: { trackingNumber: string; carrier: string; estimatedDeliveryAt?: Date | null },
): Promise<Order> {
  const trimmed = input.trackingNumber.trim();
  if (!trimmed) throw new Error("trackingNumber required");
  const carrier = input.carrier.trim();
  if (!carrier) throw new Error("carrier required");
  return prisma.order.update({
    where: { id: orderId },
    data: {
      trackingNumber: trimmed,
      carrier,
      estimatedDeliveryAt: input.estimatedDeliveryAt ?? null,
    },
  });
}

/**
 * Advance an order through the direct-sale fulfillment state machine and run
 * side effects per transition. ARRIVED is the trigger that auto-creates
 * ClosetItems via existing closet/auto-create logic.
 */
export async function transitionOrderStatus(
  orderId: string,
  next: OrderStatus,
): Promise<Order & { items: OrderItem[] }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) throw new Error("Order not found");

  const allowed = nextAllowedStatuses(order.status);
  if (!allowed.includes(next)) {
    throw new Error(
      `Cannot transition order from ${order.status} to ${next}. Allowed: ${allowed.join(", ") || "none"}`,
    );
  }

  const data: Parameters<typeof prisma.order.update>[0]["data"] = { status: next };
  if (next === "SHIPPED") data.shippedAt = new Date();
  if (next === "ARRIVED") data.arrivedAt = new Date();
  if (next === "RETURNED") data.returnedAt = new Date();

  const updated = await prisma.order.update({
    where: { id: orderId },
    data,
    include: { items: true },
  });

  if (next === "ARRIVED") {
    await createClosetItemsFromOrder(orderId);
  }

  return updated;
}

export async function setOrderNotes(
  orderId: string,
  notes: string,
): Promise<Order> {
  return prisma.order.update({
    where: { id: orderId },
    data: { customerTeamNotes: notes },
  });
}

export interface RefundResult {
  refundedInCents: number;
  stripeRefundId: string | null;
  warning: string | null;
}

/**
 * Issue an incremental Stripe refund for the order's PaymentIntent.
 *
 * `amountInCents` is the **new amount to refund this call**, on top of any
 * prior partial refunds. The Stripe idempotency key is keyed on
 * `(orderId, prevRefundedInCents, amountInCents)`, which gives the right
 * behavior across two scenarios:
 *
 *   - Same admin click delivered twice (network retry, double-click before
 *     the DB update lands): both calls see the same `prevRefundedInCents`
 *     and produce the same key → Stripe dedupes and returns the same Refund.
 *   - Two genuinely separate refunds of the same amount (admin intentionally
 *     issues a second $50): the first updates `refundedInCents`, the second
 *     reads the new value, the keys differ, and Stripe creates a second
 *     Refund as intended.
 *
 * Soft-enforces a $200 cap by returning a warning string; the admin UI
 * surfaces it but does not block.
 */
export async function refundOrder(
  orderId: string,
  amountInCents: number,
  reason?: string,
): Promise<RefundResult> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found");
  if (order.source !== "DIRECT_SALE") {
    throw new Error("Only DIRECT_SALE orders can be refunded via Wishi (others go through the retailer)");
  }
  if (!order.stripePaymentIntentId) {
    throw new Error("Order has no Stripe PaymentIntent — cannot refund");
  }
  if (!Number.isInteger(amountInCents) || amountInCents <= 0) {
    throw new Error("amountInCents must be a positive integer");
  }
  if (amountInCents > order.totalInCents) {
    throw new Error("Refund amount exceeds order total");
  }
  const alreadyRefunded = order.refundedInCents ?? 0;
  if (alreadyRefunded + amountInCents > order.totalInCents) {
    throw new Error(
      `Cannot refund ${amountInCents}; ${alreadyRefunded} already refunded of ${order.totalInCents}`,
    );
  }

  const warning = refundSoftCapWarning(amountInCents);

  const refund = await stripe.refunds.create(
    {
      payment_intent: order.stripePaymentIntentId,
      amount: amountInCents,
      reason: reason === "fraudulent" || reason === "duplicate" || reason === "requested_by_customer"
        ? reason
        : undefined,
      metadata: { orderId, reason: reason ?? "" },
    },
    { idempotencyKey: `refund:${orderId}:${alreadyRefunded}:${amountInCents}` },
  );

  // Conditional update: only advance `refundedInCents` if it hasn't moved
  // since we read it. A concurrent caller that wins this race makes our
  // update a no-op — Stripe still returns the same Refund object thanks to
  // the idempotency key, so the caller still gets a coherent result.
  await prisma.order.updateMany({
    where: { id: orderId, refundedInCents: alreadyRefunded === 0 ? null : alreadyRefunded },
    data: {
      refundedAt: new Date(),
      refundedInCents: alreadyRefunded + amountInCents,
    },
  });

  return {
    refundedInCents: alreadyRefunded + amountInCents,
    stripeRefundId: refund.id,
    warning,
  };
}
