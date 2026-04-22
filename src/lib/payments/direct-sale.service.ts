import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { Prisma } from "@/generated/prisma/client";
import { getOrCreateStripeCustomer } from "./stripe-customer";
import { getProduct } from "@/lib/inventory/inventory-client";
import { getMerchandised } from "@/lib/products/merchandised-product.service";
import { getCartItemsByIds } from "@/lib/cart/cart.service";
import type { SessionStatus } from "@/generated/prisma/client";

export const LUX_PRIORITY_SHIPPING_CENTS = 0;
export const STANDARD_SHIPPING_CENTS = 1000; // $10 flat — Stripe Tax computes tax on top

export interface CreateDirectSaleCheckoutInput {
  userId: string;
  cartItemIds: string[];
  successUrl: string;
  cancelUrl: string;
  // Test seam: integration tests pass a fake so we can exercise pre-create +
  // metadata plumbing without hitting Stripe. Production callers omit this.
  deps?: {
    createCheckoutSession?: (
      params: Stripe.Checkout.SessionCreateParams,
      options?: { idempotencyKey?: string },
    ) => Promise<{ id: string; url: string | null }>;
  };
}

interface ResolvedLineItem {
  cartItemId: string;
  inventoryProductId: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  unitAmountInCents: number;
  quantity: number;
  taxCode: string;
  merchant: string | null;
}

const DEFAULT_TAX_CODE = "txcd_99999999"; // generic taxable goods

// Lux concierge shipping is offered only while the session is actively in flight.
// Once the client has approved end-of-session, completed it, or never started,
// they pay standard shipping like any other customer.
const LUX_SHIPPING_ELIGIBLE_STATUSES: ReadonlySet<SessionStatus> = new Set<SessionStatus>([
  "ACTIVE",
  "PENDING_END",
  "PENDING_END_APPROVAL",
  "END_DECLINED",
]);

/**
 * Resolve cart items into line items via the inventory service. Throws if any
 * item is no longer direct-sale (admin may have unflagged it), missing from
 * inventory, or out of stock — direct-sale checkout is finance-sensitive, so
 * we fail loud rather than silently fall back to a stale/wrong listing.
 */
async function resolveLineItems(
  userId: string,
  cartItemIds: string[],
): Promise<{ items: ResolvedLineItem[]; sessionId: string }> {
  if (cartItemIds.length === 0) {
    throw new Error("Cart is empty");
  }
  const cartItems = await getCartItemsByIds(userId, cartItemIds);
  if (cartItems.length !== cartItemIds.length) {
    throw new Error("One or more cart items are missing or do not belong to you");
  }

  const sessionIds = new Set(cartItems.map((c) => c.sessionId));
  if (sessionIds.size !== 1) {
    throw new Error("Cart items must belong to the same session");
  }
  const sessionId = cartItems[0].sessionId;

  const inventoryIds = [...new Set(cartItems.map((c) => c.inventoryProductId))];
  const merch = await getMerchandised(inventoryIds);
  for (const id of inventoryIds) {
    if (!merch.get(id)?.isDirectSale) {
      throw new Error(`Product ${id} is no longer available for direct sale`);
    }
  }

  const items: ResolvedLineItem[] = [];
  for (const cartItem of cartItems) {
    const product = await getProduct(cartItem.inventoryProductId);
    if (!product) {
      throw new Error(`Product ${cartItem.inventoryProductId} not found`);
    }
    const inStockListing = product.listings.find((l) => l.in_stock);
    if (!inStockListing) {
      throw new Error(
        `Product ${cartItem.inventoryProductId} is out of stock`,
      );
    }
    const unitAmount = Math.round(
      (inStockListing.sale_price && inStockListing.sale_price > 0
        ? inStockListing.sale_price
        : inStockListing.base_price) * 100,
    );
    if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
      throw new Error(`Invalid price for ${cartItem.inventoryProductId}`);
    }
    items.push({
      cartItemId: cartItem.id,
      inventoryProductId: cartItem.inventoryProductId,
      title: inStockListing.title || product.canonical_name,
      brand: product.brand_name ?? null,
      imageUrl: inStockListing.primary_image_url || product.primary_image_url || null,
      unitAmountInCents: unitAmount,
      quantity: cartItem.quantity,
      taxCode: DEFAULT_TAX_CODE,
      merchant: inStockListing.merchant_name ?? null,
    });
  }
  return { items, sessionId };
}

/**
 * Lux session entitles the client to free priority shipping on direct-sale
 * orders placed during that session's lifecycle (Phase 9 product decision).
 */
async function isLuxShippingEligible(sessionId: string): Promise<boolean> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { planType: true, status: true },
  });
  if (!session) return false;
  if (session.planType !== "LUX") return false;
  return LUX_SHIPPING_ELIGIBLE_STATUSES.has(session.status);
}

/**
 * Create a Stripe Checkout for direct-sale items, AND atomically pre-create
 * an `Order(status=PENDING)` capturing the cart snapshot. The webhook later
 * flips PENDING → ORDERED conditionally — this avoids:
 *   - Stripe's 500-char metadata limit (50 cuids of cartItemIds blow it).
 *   - findUnique→create races where two concurrent webhook deliveries both
 *     pass the existence check and one fails on the unique index.
 *   - Drift between the cart at checkout-create time vs at webhook time.
 */
export async function createDirectSaleCheckout(input: CreateDirectSaleCheckoutInput) {
  const { items, sessionId } = await resolveLineItems(input.userId, input.cartItemIds);
  const lux = await isLuxShippingEligible(sessionId);
  const shippingInCents = lux ? LUX_PRIORITY_SHIPPING_CENTS : STANDARD_SHIPPING_CENTS;
  const isPriorityShipping = lux;

  const customerId = await getOrCreateStripeCustomer(input.userId);
  const retailer = items.find((i) => i.merchant)?.merchant ?? "wishi";

  const lineItems = items.map((it) => ({
    price_data: {
      currency: "usd",
      unit_amount: it.unitAmountInCents,
      product_data: {
        name: it.title,
        description: it.brand ?? undefined,
        images: it.imageUrl ? [it.imageUrl] : undefined,
        tax_code: it.taxCode,
      },
      tax_behavior: "exclusive" as const,
    },
    quantity: it.quantity,
    adjustable_quantity: { enabled: false },
  }));

  // Idempotency on the Stripe API call: if the user retries the same checkout
  // creation (refresh, double-click) we get back the same Stripe session
  // rather than a fresh one. The cart-id-based key is intentional because
  // changing the cart should produce a new checkout.
  const stripeIdempotencyKey = `direct-sale:${input.userId}:${[...input.cartItemIds]
    .sort()
    .join(",")}`;

  const createCheckoutImpl =
    input.deps?.createCheckoutSession ??
    (async (
      params: Stripe.Checkout.SessionCreateParams,
      options?: { idempotencyKey?: string },
    ) => {
      const s = await stripe.checkout.sessions.create(params, options);
      return { id: s.id, url: s.url };
    });

  const checkout = await createCheckoutImpl(
    {
      customer: customerId,
      mode: "payment",
      line_items: lineItems,
      automatic_tax: { enabled: true },
      shipping_address_collection: { allowed_countries: ["US"] },
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            display_name: isPriorityShipping ? "Priority (Lux)" : "Standard",
            fixed_amount: { amount: shippingInCents, currency: "usd" },
            tax_behavior: "exclusive" as const,
          },
        },
      ],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      // Metadata stays small — enough to identify the order on the webhook side.
      metadata: {
        purpose: "DIRECT_SALE",
        userId: input.userId,
        sessionId,
      },
    },
    { idempotencyKey: stripeIdempotencyKey },
  );

  // Pre-create the PENDING Order. The unique on stripeCheckoutSessionId means
  // a retry of this same checkout (Stripe returned the same session id) is a
  // no-op — we look up the existing Order and return.
  try {
    await prisma.order.create({
      data: {
        userId: input.userId,
        sessionId,
        source: "DIRECT_SALE",
        status: "PENDING",
        retailer,
        totalInCents: 0, // filled in by webhook from Stripe authoritative totals
        isPriorityShipping,
        currency: "usd",
        stripeCheckoutSessionId: checkout.id,
        items: {
          create: items.map((it) => ({
            inventoryProductId: it.inventoryProductId,
            title: it.title,
            brand: it.brand,
            imageUrl: it.imageUrl,
            priceInCents: it.unitAmountInCents,
            quantity: it.quantity,
          })),
        },
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Duplicate stripeCheckoutSessionId — the user retried; nothing to do.
    } else {
      throw err;
    }
  }

  return checkout;
}

/**
 * Webhook handler — finds the PENDING Order pre-created at checkout time and
 * flips it to ORDERED, filling in Stripe's authoritative tax/shipping/total
 * and the customer's shipping address. Idempotent in two ways:
 *   - `updateMany` with `status: "PENDING"` predicate: a redelivered event
 *     after the first transition matches zero rows and is a safe no-op.
 *   - The pre-created Order owns the cart snapshot, so this handler doesn't
 *     reach back into the (now-mutable) cart for line items.
 */
export async function applyDirectSaleFromCheckout(
  checkoutSession: Stripe.Checkout.Session,
) {
  const meta = checkoutSession.metadata ?? {};
  const userId = meta.userId;
  const sessionId = meta.sessionId;

  if (!userId || !sessionId) {
    console.error(
      "[stripe] applyDirectSaleFromCheckout: missing metadata",
      checkoutSession.id,
    );
    return;
  }

  const order = await prisma.order.findUnique({
    where: { stripeCheckoutSessionId: checkoutSession.id },
    include: { items: true },
  });
  if (!order) {
    // The pre-create either never happened (older flow) or the row was
    // manually deleted. Log and bail — never invent an order out of metadata.
    console.error(
      "[stripe] applyDirectSaleFromCheckout: no PENDING order for checkout",
      checkoutSession.id,
    );
    return;
  }
  if (order.status !== "PENDING") {
    return; // already processed
  }

  const totalInCents = checkoutSession.amount_total ?? 0;
  const taxInCents = checkoutSession.total_details?.amount_tax ?? 0;
  const shippingInCents = checkoutSession.total_details?.amount_shipping ?? 0;
  const currency = checkoutSession.currency ?? "usd";
  const paymentIntentId =
    typeof checkoutSession.payment_intent === "string"
      ? checkoutSession.payment_intent
      : checkoutSession.payment_intent?.id ?? null;

  // Stripe v22 moved customer-collected shipping into `collected_information`;
  // there's no top-level `shipping_details` on Session anymore.
  const shipping = checkoutSession.collected_information?.shipping_details ?? null;
  const addr = shipping?.address ?? null;

  await prisma.$transaction(async (tx) => {
    const result = await tx.order.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: {
        status: "ORDERED",
        totalInCents,
        taxInCents,
        shippingInCents,
        currency,
        stripePaymentIntentId: paymentIntentId,
        shippingName: shipping?.name ?? null,
        shippingLine1: addr?.line1 ?? null,
        shippingLine2: addr?.line2 ?? null,
        shippingCity: addr?.city ?? null,
        shippingState: addr?.state ?? null,
        shippingPostalCode: addr?.postal_code ?? null,
        shippingCountry: addr?.country ?? null,
      },
    });
    if (result.count === 0) {
      // Lost a race with another delivery — they already advanced it.
      return;
    }
    await tx.cartItem.deleteMany({
      where: {
        userId,
        sessionId,
        inventoryProductId: { in: order.items.map((i) => i.inventoryProductId) },
      },
    });
  });
}
