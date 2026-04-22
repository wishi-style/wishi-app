import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getOrCreateStripeCustomer } from "./stripe-customer";
import { getProduct } from "@/lib/inventory/inventory-client";
import { getMerchandised } from "@/lib/products/merchandised-product.service";
import { getCartItemsByIds } from "@/lib/cart/cart.service";

export const LUX_PRIORITY_SHIPPING_CENTS = 0;
export const STANDARD_SHIPPING_CENTS = 1000; // $10 flat — Stripe Tax computes tax on top

export interface CreateDirectSaleCheckoutInput {
  userId: string;
  cartItemIds: string[];
  successUrl: string;
  cancelUrl: string;
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
}

const DEFAULT_TAX_CODE = "txcd_99999999"; // generic taxable goods

/**
 * Resolve cart items into line items via the inventory service. Throws if any
 * item is no longer direct-sale (admin may have unflagged it) or the product
 * has gone missing — direct-sale checkout is finance-sensitive, fail loud.
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
    const listing = product.listings.find((l) => l.in_stock) ?? product.listings[0];
    if (!listing) {
      throw new Error(`Product ${cartItem.inventoryProductId} has no listings`);
    }
    const unitAmount = Math.round(
      (listing.sale_price && listing.sale_price > 0
        ? listing.sale_price
        : listing.base_price) * 100,
    );
    if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
      throw new Error(`Invalid price for ${cartItem.inventoryProductId}`);
    }
    items.push({
      cartItemId: cartItem.id,
      inventoryProductId: cartItem.inventoryProductId,
      title: listing.title || product.canonical_name,
      brand: product.brand_name ?? null,
      imageUrl: listing.primary_image_url || product.primary_image_url || null,
      unitAmountInCents: unitAmount,
      quantity: cartItem.quantity,
      taxCode: DEFAULT_TAX_CODE,
    });
  }
  return { items, sessionId };
}

/**
 * Lux session entitles the client to free priority shipping on direct-sale
 * orders placed during that session's lifecycle (Phase 9 product decision).
 */
async function isLuxSession(sessionId: string): Promise<boolean> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { planType: true, status: true },
  });
  if (!session) return false;
  if (session.planType !== "LUX") return false;
  // Active or just-completed — once the session is fully closed and the user
  // browses back later, treat as standard shipping.
  return session.status !== "CANCELLED";
}

export async function createDirectSaleCheckout(input: CreateDirectSaleCheckoutInput) {
  const { items, sessionId } = await resolveLineItems(input.userId, input.cartItemIds);
  const lux = await isLuxSession(sessionId);
  const shippingInCents = lux ? LUX_PRIORITY_SHIPPING_CENTS : STANDARD_SHIPPING_CENTS;
  const isPriorityShipping = lux;

  const customerId = await getOrCreateStripeCustomer(input.userId);

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

  return stripe.checkout.sessions.create(
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
      metadata: {
        purpose: "DIRECT_SALE",
        userId: input.userId,
        sessionId,
        cartItemIds: input.cartItemIds.join(","),
        isPriorityShipping: String(isPriorityShipping),
      },
    },
    { idempotencyKey: `direct-sale:${input.userId}:${[...input.cartItemIds].sort().join(",")}` },
  );
}

/**
 * Webhook handler — idempotent on `Order.stripeCheckoutSessionId`. Creates
 * `Order(source=DIRECT_SALE, status=ORDERED)` plus snapshotted `OrderItem`
 * rows from the cart, then deletes the consumed CartItem rows. Tax + shipping
 * come from Stripe's authoritative totals (`amount_total`, `total_details`,
 * `shipping_details`); we never recompute on our side post-checkout.
 */
export async function applyDirectSaleFromCheckout(
  checkoutSession: Stripe.Checkout.Session,
) {
  const meta = checkoutSession.metadata ?? {};
  const userId = meta.userId;
  const sessionId = meta.sessionId;
  const cartItemIdsRaw = meta.cartItemIds;
  const isPriorityShipping = meta.isPriorityShipping === "true";

  if (!userId || !sessionId || !cartItemIdsRaw) {
    console.error(
      "[stripe] applyDirectSaleFromCheckout: missing metadata",
      checkoutSession.id,
    );
    return;
  }
  const cartItemIds = cartItemIdsRaw.split(",").filter(Boolean);
  if (cartItemIds.length === 0) {
    console.error("[stripe] applyDirectSaleFromCheckout: empty cart", checkoutSession.id);
    return;
  }

  const existing = await prisma.order.findUnique({
    where: { stripeCheckoutSessionId: checkoutSession.id },
    select: { id: true },
  });
  if (existing) return; // idempotent

  // Re-resolve line items from the cart so the snapshot is authoritative
  // even if cart was mutated since checkout creation. (Stripe holds the cart
  // open for ~24h; the webhook fires on completion.)
  const cartItems = await prisma.cartItem.findMany({
    where: { id: { in: cartItemIds }, userId },
    select: { id: true, inventoryProductId: true, quantity: true },
  });
  if (cartItems.length === 0) {
    console.error(
      "[stripe] applyDirectSaleFromCheckout: cart items vanished",
      checkoutSession.id,
    );
    return;
  }

  // Snapshot product info from inventory at fulfillment time.
  const inventoryIds = [...new Set(cartItems.map((c) => c.inventoryProductId))];
  const productSnapshots = new Map<
    string,
    { title: string; brand: string | null; imageUrl: string | null; priceInCents: number; merchant: string | null }
  >();
  for (const id of inventoryIds) {
    const product = await getProduct(id);
    if (!product) continue;
    const listing = product.listings.find((l) => l.in_stock) ?? product.listings[0];
    productSnapshots.set(id, {
      title: listing?.title || product.canonical_name,
      brand: product.brand_name ?? null,
      imageUrl: listing?.primary_image_url || product.primary_image_url || null,
      priceInCents: Math.round(
        ((listing?.sale_price && listing.sale_price > 0 ? listing.sale_price : listing?.base_price) ?? 0) * 100,
      ),
      merchant: listing?.merchant_name ?? null,
    });
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

  // Pick the first merchant we resolved as the order's retailer label;
  // direct-sale orders are typically single-merchant in v1.
  const retailer =
    [...productSnapshots.values()].find((p) => p.merchant)?.merchant ?? "wishi";

  await prisma.$transaction(async (tx) => {
    await tx.order.create({
      data: {
        userId,
        sessionId,
        source: "DIRECT_SALE",
        status: "ORDERED",
        retailer,
        totalInCents,
        taxInCents,
        shippingInCents,
        isPriorityShipping,
        currency,
        stripeCheckoutSessionId: checkoutSession.id,
        stripePaymentIntentId: paymentIntentId,
        shippingName: shipping?.name ?? null,
        shippingLine1: addr?.line1 ?? null,
        shippingLine2: addr?.line2 ?? null,
        shippingCity: addr?.city ?? null,
        shippingState: addr?.state ?? null,
        shippingPostalCode: addr?.postal_code ?? null,
        shippingCountry: addr?.country ?? null,
        items: {
          create: cartItems.map((c) => {
            const snap = productSnapshots.get(c.inventoryProductId);
            return {
              inventoryProductId: c.inventoryProductId,
              title: snap?.title ?? "Item",
              brand: snap?.brand ?? null,
              imageUrl: snap?.imageUrl ?? null,
              priceInCents: snap?.priceInCents ?? 0,
              quantity: c.quantity,
            };
          }),
        },
      },
    });

    await tx.cartItem.deleteMany({
      where: { id: { in: cartItems.map((c) => c.id) }, userId },
    });
  });
}
