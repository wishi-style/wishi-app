import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import {
  createClosetItemForOrderItem,
  createClosetItemsFromOrder,
} from "@/lib/closet/auto-create";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import {
  getEasyPostClient,
  type EasyPostClient,
} from "@/lib/integrations/easypost";
import type {
  Order,
  OrderItem,
  OrderItemStatus,
  OrderSource,
  OrderStatus,
} from "@/generated/prisma/client";

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
  ORDERED: ["SHIPPED", "COMPLETED"],
  // New universal-fulfillment terminal — set by the per-OrderItem rollup once
  // every line resolves to PURCHASED or UNFULFILLABLE. No further transitions
  // from this state; refunds and returns happen at the OrderItem level.
  COMPLETED: [],
  SHIPPED: ["ARRIVED"],
  ARRIVED: ["RETURN_IN_PROCESS"],
  RETURN_IN_PROCESS: ["RETURNED"],
  RETURNED: [],
};

export function nextAllowedStatuses(current: OrderStatus): OrderStatus[] {
  return STATUS_TRANSITIONS[current] ?? [];
}

export interface SetOrderTrackingOptions {
  /**
   * Test seam + a kill-switch for environments that don't have an EasyPost
   * key configured. When omitted, uses the lazy global client; pass a fake
   * to unit-test the flow without network.
   */
  deps?: { easypost?: EasyPostClient | null };
}

export async function setOrderTracking(
  orderId: string,
  input: { trackingNumber: string; carrier: string; estimatedDeliveryAt?: Date | null },
  options: SetOrderTrackingOptions = {},
): Promise<Order> {
  const trimmed = input.trackingNumber.trim();
  if (!trimmed) throw new Error("trackingNumber required");
  const carrier = input.carrier.trim();
  if (!carrier) throw new Error("carrier required");

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      trackingNumber: trimmed,
      carrier,
      estimatedDeliveryAt: input.estimatedDeliveryAt ?? null,
    },
  });

  // Register the tracker with EasyPost so webhooks flow. Non-fatal: admin
  // already has a saved tracking number even if EasyPost is down, and the
  // webhook handler idempotently replays status updates when service
  // resumes. Skip entirely when `deps.easypost` is explicitly null (tests).
  const easypost =
    options.deps?.easypost === null
      ? null
      : (options.deps?.easypost ?? (process.env.EASYPOST_API_KEY ? getEasyPostClient() : null));

  if (easypost) {
    await easypost
      .createTracker({ trackingCode: trimmed, carrier })
      .catch((err) => {
        console.warn(
          `[orders] easypost createTracker failed for ${orderId}:`,
          err instanceof Error ? err.message : err,
        );
      });
  }

  return updated;
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

  const emailEvent =
    next === "SHIPPED"
      ? "order.shipped"
      : next === "ARRIVED"
        ? "order.arrived"
        : null;

  if (emailEvent) {
    const itemTitle = updated.items[0]?.title ?? "your order";
    const extra = updated.items.length > 1 ? ` and ${updated.items.length - 1} more` : "";
    const title =
      emailEvent === "order.shipped" ? "Your Wishi order shipped" : "Your Wishi order arrived";
    const body =
      emailEvent === "order.shipped"
        ? `${itemTitle}${extra} is on the way${updated.trackingNumber ? ` (tracking ${updated.trackingNumber})` : ""}.`
        : `${itemTitle}${extra} just arrived — enjoy!`;
    await dispatchNotification({
      event: emailEvent,
      userId: updated.userId,
      title,
      body,
      url: `/orders/${updated.id}`,
      emailProperties: {
        orderId: updated.id,
        retailer: updated.retailer,
        totalInCents: updated.totalInCents,
        trackingNumber: updated.trackingNumber,
        carrier: updated.carrier,
        itemCount: updated.items.length,
        firstItemTitle: itemTitle,
        firstItemImageUrl: updated.items[0]?.imageUrl ?? null,
      },
    }).catch((err) => {
      console.warn(`[orders] ${emailEvent} dispatch failed for ${updated.id}:`, err);
    });
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

// ─── Per-OrderItem fulfillment (universal Unicart) ───────────────────────

export const UNFULFILLABLE_REASONS = [
  "out_of_stock",
  "wont_ship",
  "price_jumped",
  "retailer_issue",
  "other",
] as const;
export type UnfulfillableReason = (typeof UNFULFILLABLE_REASONS)[number];

const ITEM_STATUS_TRANSITIONS: Record<OrderItemStatus, OrderItemStatus[]> = {
  // Fulfiller decides: did the retailer order succeed or fail?
  PENDING: ["PURCHASED", "UNFULFILLABLE"],
  // Client-initiated returns mirror retailer refunds back through Wishi.
  PURCHASED: ["RETURN_REQUESTED"],
  // UNFULFILLABLE refunds at transition time — no further moves.
  UNFULFILLABLE: [],
  // Admin verifies the user-submitted retailer return reference, then
  // moves to RETURNED which fires the mirror refund.
  RETURN_REQUESTED: ["RETURNED"],
  RETURNED: [],
};

export function nextAllowedItemStatuses(
  current: OrderItemStatus,
): OrderItemStatus[] {
  return ITEM_STATUS_TRANSITIONS[current] ?? [];
}

export interface TransitionOrderItemInput {
  retailerOrderRef?: string | null;
  unfulfillableReason?: UnfulfillableReason | null;
  unfulfillableNotes?: string | null;
  returnReceiptRef?: string | null;
}

/**
 * Compute the refund amount for a single OrderItem line: line price × qty
 * plus the line's proportional share of the order-level tax. Shipping is
 * NOT refunded per-line — the rest of the order is still shipping, so the
 * flat shipping fee covers logistics overhead. (If *every* line is
 * UNFULFILLABLE, the rollup separately refunds the full shipping.)
 *
 * Returns 0 (no refund) for items already refunded — the caller treats 0
 * as "skip the Stripe call but still flip status".
 */
export function lineRefundCents(
  item: Pick<OrderItem, "priceInCents" | "quantity" | "refundedInCents">,
  order: Pick<Order, "totalInCents" | "taxInCents" | "shippingInCents">,
  options: { includeShipping?: boolean } = {},
): number {
  if (item.refundedInCents > 0) return 0;

  const lineSubtotal = item.priceInCents * item.quantity;
  const orderSubtotal =
    order.totalInCents - order.taxInCents - order.shippingInCents;

  // Tax allocation: line's share of (subtotal+tax) is proportional to line
  // subtotal / order subtotal. Avoid divide-by-zero when an order has no
  // subtotal (shouldn't happen in production, but defensive).
  const taxShare =
    orderSubtotal > 0
      ? Math.round((lineSubtotal / orderSubtotal) * order.taxInCents)
      : 0;
  const shippingShare = options.includeShipping ? order.shippingInCents : 0;

  return lineSubtotal + taxShare + shippingShare;
}

export type CreateRefundFnForItem = CreateRefundFn;

export interface TransitionOrderItemOptions {
  deps?: { createRefund?: CreateRefundFnForItem };
}

export interface TransitionOrderItemResult {
  orderItem: OrderItem;
  order: Order;
  refundedInCents: number;
  stripeRefundId: string | null;
  orderRolledUp: boolean;
}

/**
 * Drive a single OrderItem through its fulfillment state machine and fan
 * out the right side effects per transition:
 *   PENDING → PURCHASED       : create the user's ClosetItem snapshot
 *   PENDING → UNFULFILLABLE   : fire a partial Stripe refund for the line
 *                                (if every other line is also resolved as
 *                                UNFULFILLABLE, the rollup refunds
 *                                shipping too)
 *   PURCHASED → RETURN_REQUESTED : user-initiated return (capture
 *                                receipt ref; no Stripe call yet)
 *   RETURN_REQUESTED → RETURNED : admin verified the retailer refund;
 *                                fire the Stripe mirror refund
 *
 * After any transition that resolves the item (PURCHASED / UNFULFILLABLE /
 * RETURNED), we re-read the parent Order and roll Order.status up to
 * COMPLETED once every item is PURCHASED or UNFULFILLABLE.
 */
export async function transitionOrderItemStatus(
  orderItemId: string,
  next: OrderItemStatus,
  input: TransitionOrderItemInput = {},
  options: TransitionOrderItemOptions = {},
): Promise<TransitionOrderItemResult> {
  const orderItem = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    include: { order: true },
  });
  if (!orderItem) throw new Error("OrderItem not found");

  const allowed = nextAllowedItemStatuses(orderItem.status);
  if (!allowed.includes(next)) {
    throw new Error(
      `Cannot transition OrderItem from ${orderItem.status} to ${next}. Allowed: ${
        allowed.join(", ") || "none"
      }`,
    );
  }

  if (
    next === "UNFULFILLABLE" &&
    input.unfulfillableReason &&
    !UNFULFILLABLE_REASONS.includes(input.unfulfillableReason)
  ) {
    throw new Error(
      `Invalid unfulfillableReason. Allowed: ${UNFULFILLABLE_REASONS.join(", ")}`,
    );
  }

  const createRefundImpl: CreateRefundFn =
    options.deps?.createRefund ??
    (async (params, opts) => {
      const r = await stripe.refunds.create(params, opts);
      return { id: r.id };
    });

  const now = new Date();
  const data: Parameters<typeof prisma.orderItem.update>[0]["data"] = {
    status: next,
  };

  let refundCents = 0;
  let stripeRefundId: string | null = null;
  let refundIdempotency: string | null = null;

  if (next === "PURCHASED") {
    if (input.retailerOrderRef) {
      data.retailerOrderRef = input.retailerOrderRef;
    }
  } else if (next === "UNFULFILLABLE") {
    data.unfulfillableReason = input.unfulfillableReason ?? null;
    data.unfulfillableNotes = input.unfulfillableNotes ?? null;
    refundCents = lineRefundCents(orderItem, orderItem.order);
    refundIdempotency = `unfulfillable_refund:${orderItem.id}`;
  } else if (next === "RETURN_REQUESTED") {
    data.returnRequestedAt = now;
    if (input.returnReceiptRef) data.returnReceiptRef = input.returnReceiptRef;
  } else if (next === "RETURNED") {
    refundCents = lineRefundCents(orderItem, orderItem.order);
    refundIdempotency = `return_refund:${orderItem.id}`;
  }

  if (refundCents > 0 && orderItem.order.source !== "DIRECT_SALE") {
    throw new Error(
      "Per-item refunds are only valid for DIRECT_SALE orders (others settle through the retailer)",
    );
  }

  if (refundCents > 0 && !orderItem.order.stripePaymentIntentId) {
    throw new Error("Order has no Stripe PaymentIntent — cannot refund line");
  }

  if (refundCents > 0 && orderItem.order.stripePaymentIntentId) {
    const refund = await createRefundImpl(
      {
        payment_intent: orderItem.order.stripePaymentIntentId,
        amount: refundCents,
        reason: "requested_by_customer",
        metadata: {
          orderId: orderItem.order.id,
          orderItemId: orderItem.id,
          transition: next,
        },
      },
      { idempotencyKey: refundIdempotency ?? undefined },
    );
    stripeRefundId = refund.id;
    data.refundedInCents = refundCents;
    data.refundedAt = now;
  }

  // Apply the OrderItem update + order-level refund accumulation atomically.
  const { item, order } = await prisma.$transaction(async (tx) => {
    const updatedItem = await tx.orderItem.update({
      where: { id: orderItemId },
      data,
    });

    if (refundCents > 0) {
      // Accumulate on the parent Order's roll-up so the existing admin
      // "refundable" math stays accurate. updateMany with a guard against
      // the prior value avoids a lost write under concurrent transitions
      // (rare — admin tool is single-actor — but cheap to defend).
      const prevRefunded = orderItem.order.refundedInCents ?? 0;
      await tx.order.updateMany({
        where: {
          id: orderItem.order.id,
          refundedInCents: prevRefunded === 0 ? null : prevRefunded,
        },
        data: {
          refundedInCents: prevRefunded + refundCents,
          refundedAt: now,
        },
      });
    }

    const updatedOrder = await tx.order.findUnique({
      where: { id: orderItem.order.id },
      include: { items: true },
    });
    if (!updatedOrder) {
      throw new Error("Order disappeared mid-transition");
    }
    return { item: updatedItem, order: updatedOrder };
  });

  // ClosetItem auto-create (PURCHASED only). Side-effect outside the
  // transaction so a closet write that fails doesn't roll back the
  // fulfillment status. Idempotent inside createClosetItemForOrderItem.
  if (next === "PURCHASED") {
    await createClosetItemForOrderItem({
      ...item,
      userId: order.userId,
    }).catch((err) => {
      console.warn(
        `[orders] closet auto-create failed for OrderItem ${item.id}:`,
        err instanceof Error ? err.message : err,
      );
    });
  }

  // Per-item user-facing notifications. Best-effort — the OrderItem and
  // refund already landed transactionally; a Klaviyo outage shouldn't
  // revert the fulfillment state.
  if (next === "UNFULFILLABLE") {
    const refundDollars = (refundCents / 100).toFixed(2);
    await dispatchNotification({
      event: "order.partially_fulfilled",
      userId: order.userId,
      title: `Couldn't source ${item.title}`,
      body: `${item.retailerName ?? "The retailer"} couldn't fulfill ${item.title}. We've refunded $${refundDollars} — the rest of your order is still on its way.`,
      url: `/orders/${order.id}`,
      emailProperties: {
        orderId: order.id,
        orderItemId: item.id,
        title: item.title,
        retailerName: item.retailerName,
        imageUrl: item.imageUrl,
        refundedInCents: refundCents,
        reason: item.unfulfillableReason,
        notes: item.unfulfillableNotes,
      },
    }).catch((err) => {
      console.warn(
        `[orders] order.partially_fulfilled dispatch failed for ${item.id}:`,
        err,
      );
    });
  } else if (next === "RETURNED" && refundCents > 0) {
    const refundDollars = (refundCents / 100).toFixed(2);
    await dispatchNotification({
      event: "order.refunded",
      userId: order.userId,
      title: "Refund issued",
      body: `We refunded $${refundDollars} for ${item.title}. It should appear on your card in 5–10 business days.`,
      url: `/orders/${order.id}`,
      emailProperties: {
        orderId: order.id,
        orderItemId: item.id,
        title: item.title,
        retailerName: item.retailerName,
        imageUrl: item.imageUrl,
        refundedInCents: refundCents,
        stripeRefundId,
      },
    }).catch((err) => {
      console.warn(
        `[orders] order.refunded dispatch failed for ${item.id}:`,
        err,
      );
    });
  }

  // Order-level rollup: every item is resolved → Order.status = COMPLETED.
  // Only apply when the parent Order is in ORDERED (don't auto-flip orders
  // currently in legacy SHIPPED/ARRIVED transitions).
  let orderRolledUp = false;
  if (order.status === "ORDERED") {
    const allResolved = order.items.every(
      (it) =>
        it.status === "PURCHASED" ||
        it.status === "UNFULFILLABLE" ||
        it.status === "RETURNED",
    );
    const allUnfulfillable = order.items.every(
      (it) => it.status === "UNFULFILLABLE",
    );
    if (allResolved) {
      const rollupData: Parameters<typeof prisma.order.update>[0]["data"] = {
        status: "COMPLETED",
      };
      // Edge case: if every item failed, also refund shipping so the user
      // isn't out $10 for an order that delivered nothing.
      if (allUnfulfillable && order.shippingInCents > 0) {
        if (order.stripePaymentIntentId) {
          const shippingRefund = await createRefundImpl(
            {
              payment_intent: order.stripePaymentIntentId,
              amount: order.shippingInCents,
              reason: "requested_by_customer",
              metadata: {
                orderId: order.id,
                transition: "shipping_refund_all_unfulfillable",
              },
            },
            { idempotencyKey: `shipping_refund:${order.id}` },
          );
          rollupData.refundedInCents =
            (order.refundedInCents ?? 0) + order.shippingInCents;
          rollupData.refundedAt = now;
          stripeRefundId = stripeRefundId ?? shippingRefund.id;
        }
      }
      await prisma.order.update({
        where: { id: order.id },
        data: rollupData,
      });
      orderRolledUp = true;
    }
  }

  return {
    orderItem: item,
    order,
    refundedInCents: refundCents,
    stripeRefundId,
    orderRolledUp,
  };
}

export interface RefundResult {
  refundedInCents: number;
  stripeRefundId: string | null;
  warning: string | null;
}

// Test seam: integration tests pass a fake so we can exercise the full
// DB-plus-refund path without hitting Stripe. Production callers omit this.
export type CreateRefundFn = (
  params: Stripe.RefundCreateParams,
  options?: { idempotencyKey?: string },
) => Promise<{ id: string }>;

export interface RefundOrderOptions {
  reason?: string;
  deps?: { createRefund?: CreateRefundFn };
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
  optionsOrReason?: RefundOrderOptions | string,
): Promise<RefundResult> {
  const opts: RefundOrderOptions =
    typeof optionsOrReason === "string"
      ? { reason: optionsOrReason }
      : optionsOrReason ?? {};
  const reason = opts.reason;
  const createRefundImpl: CreateRefundFn =
    opts.deps?.createRefund ??
    (async (params, options) => {
      const r = await stripe.refunds.create(params, options);
      return { id: r.id };
    });

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

  const refund = await createRefundImpl(
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

  await dispatchNotification({
    event: "order.refunded",
    userId: order.userId,
    title: "Refund issued",
    body: `We refunded $${(amountInCents / 100).toFixed(2)} to your original payment method.`,
    url: `/orders/${orderId}`,
    emailProperties: {
      orderId,
      refundedInCents: alreadyRefunded + amountInCents,
      refundAmountInCents: amountInCents,
      stripeRefundId: refund.id,
      reason: reason ?? null,
    },
  }).catch((err) => {
    console.warn(`[orders] order.refunded dispatch failed for ${orderId}:`, err);
  });

  return {
    refundedInCents: alreadyRefunded + amountInCents,
    stripeRefundId: refund.id,
    warning,
  };
}
