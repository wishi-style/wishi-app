// Native /checkout (Stripe Elements) variant of the direct-sale path.
//
// Differences from direct-sale.service.ts (Hosted Checkout):
//   - Card collection: <PaymentElement> in our /checkout, not Stripe-hosted.
//   - Tax: PaymentIntents don't support automatic_tax, so we call
//     stripe.tax.calculations.create() at form-step transition (preview the
//     tax line in the Order Summary), then commit the calculation via
//     stripe.tax.transactions.createFromCalculation() on the
//     payment_intent.succeeded webhook. Same Stripe Tax authority — just
//     wired manually instead of via Hosted.
//   - Address: collected by our shipping form (step 1) and passed to the
//     PaymentIntent as `shipping`. AddressElement on the payment step is for
//     the billing address.
//   - State machine: Order PENDING → ORDERED via the same conditional
//     updateMany pattern as the Hosted path; idempotent on replay.

import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { Prisma } from "@/generated/prisma/client";
import { getOrCreateStripeCustomer } from "./stripe-customer";
import {
  resolveLineItems,
  isLuxShippingEligible,
  LUX_PRIORITY_SHIPPING_CENTS,
  STANDARD_SHIPPING_CENTS,
} from "./direct-sale.service";

export interface ShippingAddress {
  name: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string; // 2-letter US state code
  postalCode: string;
  country: string; // ISO-3166-1 alpha-2; today only "US"
}

export interface CalculateDirectSaleTaxInput {
  userId: string;
  cartItemIds: string[];
  address: ShippingAddress;
  // Test seam: integration tests stub the Stripe Tax call.
  deps?: {
    createTaxCalculation?: (
      params: Stripe.Tax.CalculationCreateParams,
    ) => Promise<Stripe.Tax.Calculation>;
  };
}

export interface DirectSaleTaxQuote {
  calculationId: string;
  subtotalInCents: number;
  taxInCents: number;
  shippingInCents: number;
  totalInCents: number;
  isPriorityShipping: boolean;
  currency: string;
  items: Array<{
    cartItemId: string;
    inventoryProductId: string;
    title: string;
    brand: string | null;
    imageUrl: string | null;
    unitAmountInCents: number;
    quantity: number;
  }>;
}

function toStripeAddress(address: ShippingAddress): Stripe.AddressParam {
  return {
    line1: address.line1,
    line2: address.line2 ?? undefined,
    city: address.city,
    state: address.state,
    postal_code: address.postalCode,
    country: address.country,
  };
}

/**
 * Compute the Stripe Tax quote for a cart + address. Returns a
 * `calculationId` valid for ~48h that the PaymentIntent commit later
 * references via `stripe.tax.transactions.createFromCalculation`.
 *
 * Throws on the same conditions as `resolveLineItems` (empty / missing /
 * non-direct-sale / out-of-stock) — callers surface that to the user as a
 * cart error, not a generic checkout failure.
 */
export async function calculateDirectSaleTax(
  input: CalculateDirectSaleTaxInput,
): Promise<DirectSaleTaxQuote> {
  const { items, sessionId } = await resolveLineItems(
    input.userId,
    input.cartItemIds,
  );
  const lux = await isLuxShippingEligible(sessionId);
  const shippingInCents = lux
    ? LUX_PRIORITY_SHIPPING_CENTS
    : STANDARD_SHIPPING_CENTS;
  const isPriorityShipping = lux;

  const subtotalInCents = items.reduce(
    (sum, it) => sum + it.unitAmountInCents * it.quantity,
    0,
  );

  const taxParams: Stripe.Tax.CalculationCreateParams = {
    currency: "usd",
    line_items: items.map((it) => ({
      amount: it.unitAmountInCents * it.quantity,
      reference: it.cartItemId,
      tax_code: it.taxCode,
      tax_behavior: "exclusive",
    })),
    customer_details: {
      address: {
        line1: input.address.line1,
        line2: input.address.line2 ?? undefined,
        city: input.address.city,
        state: input.address.state,
        postal_code: input.address.postalCode,
        country: input.address.country,
      },
      address_source: "shipping",
    },
    shipping_cost: {
      amount: shippingInCents,
      tax_behavior: "exclusive",
    },
  };

  const createImpl =
    input.deps?.createTaxCalculation ??
    ((params: Stripe.Tax.CalculationCreateParams) =>
      stripe.tax.calculations.create(params));
  const calculation = await createImpl(taxParams);

  if (!calculation.id) {
    // Stripe Tax is configured to compute (per the explore on
    // direct-sale.service.ts) but a misconfigured account can return a
    // calculation without an id. Refuse to proceed — committing later
    // depends on this id.
    throw new Error("Stripe Tax did not return a calculation id");
  }

  return {
    calculationId: calculation.id,
    subtotalInCents,
    taxInCents: calculation.tax_amount_exclusive,
    shippingInCents,
    totalInCents: calculation.amount_total,
    isPriorityShipping,
    currency: "usd",
    items: items.map((it) => ({
      cartItemId: it.cartItemId,
      inventoryProductId: it.inventoryProductId,
      title: it.title,
      brand: it.brand,
      imageUrl: it.imageUrl,
      unitAmountInCents: it.unitAmountInCents,
      quantity: it.quantity,
    })),
  };
}

export interface CreateDirectSalePaymentIntentInput {
  userId: string;
  cartItemIds: string[];
  address: ShippingAddress;
  email?: string | null;
  // Test seams. Production omits all of these.
  deps?: {
    createTaxCalculation?: (
      params: Stripe.Tax.CalculationCreateParams,
    ) => Promise<Stripe.Tax.Calculation>;
    createPaymentIntent?: (
      params: Stripe.PaymentIntentCreateParams,
      options?: { idempotencyKey?: string },
    ) => Promise<{ id: string; client_secret: string | null; amount: number }>;
  };
}

export interface CreateDirectSalePaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
  orderId: string;
  totalInCents: number;
  taxInCents: number;
  shippingInCents: number;
}

/**
 * Create the PaymentIntent for an Elements-based direct-sale checkout, and
 * pre-create the matching `Order(status=PENDING)`.
 *
 * Same atomicity story as Hosted Checkout (`direct-sale.service.ts:218–251`):
 * the cart snapshot is owned by the Order, the PaymentIntent metadata only
 * carries small identifiers, and the webhook flips PENDING → ORDERED with a
 * conditional `updateMany` keyed on `orderId`.
 *
 * Tax is recomputed defensively here even if the caller passed a previous
 * calculationId from `calculateDirectSaleTax` — calculations expire and the
 * cart can be mutated between preview and pay. We always charge what the
 * latest calculation says.
 */
export async function createDirectSalePaymentIntent(
  input: CreateDirectSalePaymentIntentInput,
): Promise<CreateDirectSalePaymentIntentResult> {
  const quote = await calculateDirectSaleTax({
    userId: input.userId,
    cartItemIds: input.cartItemIds,
    address: input.address,
    deps: input.deps?.createTaxCalculation
      ? { createTaxCalculation: input.deps.createTaxCalculation }
      : undefined,
  });

  const { items, sessionId } = await resolveLineItems(
    input.userId,
    input.cartItemIds,
  );
  const customerId = await getOrCreateStripeCustomer(input.userId);
  const retailer = items.find((i) => i.merchant)?.merchant ?? "wishi";

  // Pre-create the Order before we hold money. Same defensive ordering as
  // Hosted: if the PaymentIntent succeeds and the webhook fires before we
  // wrote the Order, the webhook would have nothing to flip.
  const order = await prisma.order.create({
    data: {
      userId: input.userId,
      sessionId,
      source: "DIRECT_SALE",
      status: "PENDING",
      retailer,
      totalInCents: quote.totalInCents,
      taxInCents: quote.taxInCents,
      shippingInCents: quote.shippingInCents,
      isPriorityShipping: quote.isPriorityShipping,
      currency: quote.currency,
      shippingName: input.address.name,
      shippingLine1: input.address.line1,
      shippingLine2: input.address.line2 ?? null,
      shippingCity: input.address.city,
      shippingState: input.address.state,
      shippingPostalCode: input.address.postalCode,
      shippingCountry: input.address.country,
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
    select: { id: true },
  });

  const piParams: Stripe.PaymentIntentCreateParams = {
    amount: quote.totalInCents,
    currency: quote.currency,
    customer: customerId,
    automatic_payment_methods: { enabled: true },
    receipt_email: input.email ?? undefined,
    shipping: {
      name: input.address.name,
      address: toStripeAddress(input.address),
    },
    // Metadata stays small — orderId resolves the cart snapshot via the
    // pre-created Order, and taxCalculationId lets the webhook commit the
    // Stripe Tax transaction. Avoid stuffing line items here; the 500-char
    // limit will bite at ~30 cuids.
    metadata: {
      purpose: "DIRECT_SALE",
      userId: input.userId,
      sessionId,
      orderId: order.id,
      taxCalculationId: quote.calculationId,
    },
  };

  // Idempotency on the Stripe API call: refresh / double-click returns the
  // same intent rather than spinning up a duplicate. Keyed on the cart and
  // the total (so changing the cart, or even just the total via tax,
  // produces a new intent).
  const idempotencyKey = `direct-sale-pi:${input.userId}:${[...input.cartItemIds]
    .sort()
    .join(",")}:${quote.totalInCents}`;

  const createImpl =
    input.deps?.createPaymentIntent ??
    (async (
      params: Stripe.PaymentIntentCreateParams,
      options?: { idempotencyKey?: string },
    ) => {
      const pi = await stripe.paymentIntents.create(params, options);
      return { id: pi.id, client_secret: pi.client_secret, amount: pi.amount };
    });

  const intent = await createImpl(piParams, { idempotencyKey });

  if (!intent.client_secret) {
    // The PaymentIntent was created but Stripe didn't return a secret —
    // fail the request rather than rendering an unconfirmable form.
    throw new Error("Stripe did not return a client_secret");
  }

  // Bind the Order to the PaymentIntent so the webhook can flip it.
  try {
    await prisma.order.update({
      where: { id: order.id },
      data: { stripePaymentIntentId: intent.id },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Lost a race with a retried request that already bound this PI.
      // Both Orders point at the same PI — webhook will pick one and flip.
    } else {
      throw err;
    }
  }

  return {
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
    orderId: order.id,
    totalInCents: quote.totalInCents,
    taxInCents: quote.taxInCents,
    shippingInCents: quote.shippingInCents,
  };
}

/**
 * Webhook handler — flips Order(PENDING) → ORDERED for the Elements path,
 * commits the Stripe Tax transaction, and clears the cart.
 *
 * Idempotency:
 *   - `updateMany` predicate on `status = "PENDING"`: redelivered events
 *     after the first flip match zero rows and no-op.
 *   - Cart deletion is keyed on the snapshot stored on the Order so it
 *     can't accidentally clear items added between checkout and webhook.
 *   - `tax.transactions.createFromCalculation` is idempotent on
 *     `reference` server-side; failures are warned, never thrown.
 */
export async function applyDirectSalePaymentIntentSucceeded(
  pi: Stripe.PaymentIntent,
): Promise<void> {
  const meta = pi.metadata ?? {};
  if (meta.purpose !== "DIRECT_SALE") return;

  const orderId = typeof meta.orderId === "string" ? meta.orderId : null;
  const userId = typeof meta.userId === "string" ? meta.userId : null;
  const sessionId = typeof meta.sessionId === "string" ? meta.sessionId : null;
  const taxCalculationId =
    typeof meta.taxCalculationId === "string" ? meta.taxCalculationId : null;

  if (!orderId || !userId || !sessionId) {
    console.error(
      "[stripe] applyDirectSalePaymentIntentSucceeded: missing metadata",
      pi.id,
    );
    return;
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) {
    console.error(
      "[stripe] applyDirectSalePaymentIntentSucceeded: no order",
      orderId,
    );
    return;
  }
  if (order.status !== "PENDING") return;

  await prisma.$transaction(async (tx) => {
    const result = await tx.order.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: {
        status: "ORDERED",
        stripePaymentIntentId: pi.id,
        // Stripe is the authority on totals; trust it over our pre-create
        // values (the quote can drift if the cart changed between preview
        // and pay; createDirectSalePaymentIntent recomputed but a delayed
        // webhook delivery + late mutation is still possible).
        totalInCents: pi.amount,
      },
    });
    if (result.count === 0) return; // lost the race
    await tx.cartItem.deleteMany({
      where: {
        userId,
        sessionId,
        inventoryProductId: { in: order.items.map((i) => i.inventoryProductId) },
      },
    });
  });

  if (taxCalculationId) {
    try {
      await stripe.tax.transactions.createFromCalculation({
        calculation: taxCalculationId,
        reference: orderId,
      });
    } catch (err) {
      // Don't fail the webhook for a tax-commit error — the Order flipped,
      // money settled. Log loud so finance can reconcile.
      console.warn(
        "[stripe] tax.transactions.createFromCalculation failed",
        { orderId, taxCalculationId, error: err instanceof Error ? err.message : err },
      );
    }
  }
}
