import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import {
  handleCheckoutCompleted,
  handleSubscriptionCreated,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleInvoicePaymentSucceeded,
  handleInvoicePaymentFailed,
} from "@/lib/payments/webhook-handlers";
import {
  handleAccountUpdated,
  handleTipPaymentSucceeded,
  handleTransferFailed,
  handleTransferPaid,
} from "@/lib/payments/payout-webhooks";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
      case "customer.subscription.created":
        await handleSubscriptionCreated(event.data.object);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;
      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object);
        break;
      case "transfer.created":
        // Stripe confirms the platform-to-connected-account transfer has
        // cleared into the stylist's Stripe balance. We mark Payout as
        // COMPLETED here; the subsequent connected-account bank payout is
        // Stripe's concern, not ours to track.
        await handleTransferPaid(event.data.object);
        break;
      case "transfer.reversed":
        await handleTransferFailed(event.data.object);
        break;
      case "account.updated":
        await handleAccountUpdated(event.data.object);
        break;
      case "payment_intent.succeeded":
        await handleTipPaymentSucceeded(event.data.object);
        break;
      default:
        console.log(`[stripe webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`[stripe webhook] Error handling ${event.type}:`, err);
    return NextResponse.json({ error: "Webhook handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
