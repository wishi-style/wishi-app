"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { stripe } from "@/lib/stripe";
import { approveEnd } from "@/lib/sessions/transitions";
import { validateTip } from "@/lib/payments/tip-policy";

export type EndSessionFeedbackInput = {
  sessionId: string;
  tipCents: number;
  rating: number;
  reviewText?: string | null;
};

export type EndSessionFeedbackResult =
  | { status: "ok"; clientSecret: string | null }
  | { status: "error"; message: string };

// submitEndSessionFeedback writes the rating/review immediately (fast,
// no payment dependency), creates a tip PaymentIntent if tipCents > 0 so the
// client-side PaymentElement can confirm it, and approves the session end.
//
// The PaymentIntent's `payment_intent.succeeded` webhook is the durable write
// for Session.tipInCents + Payment(type=TIP) — the Server Action's job is to
// set up the intent and transition the session.
export async function submitEndSessionFeedback(
  input: EndSessionFeedbackInput
): Promise<EndSessionFeedbackResult> {
  const user = await getCurrentAuthUser();
  if (!user) return { status: "error", message: "Not signed in" };

  const session = await prisma.session.findUnique({
    where: { id: input.sessionId },
    select: {
      id: true,
      clientId: true,
      status: true,
      planType: true,
    },
  });
  if (!session || session.clientId !== user.id) {
    return { status: "error", message: "Session not found" };
  }
  if (session.status !== "PENDING_END_APPROVAL" && session.status !== "COMPLETED") {
    return { status: "error", message: `Cannot submit feedback for session in ${session.status}` };
  }
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return { status: "error", message: "Rating must be 1–5 stars" };
  }

  const plan = await prisma.plan.findUnique({
    where: { type: session.planType },
    select: { priceInCents: true },
  });
  if (!plan) return { status: "error", message: "Plan lookup failed" };

  const tipCheck = validateTip(input.tipCents, plan.priceInCents);
  if (!tipCheck.ok) return { status: "error", message: tipCheck.reason };

  // Write rating/review immediately — not payment-gated.
  await prisma.session.update({
    where: { id: session.id },
    data: {
      rating: input.rating,
      reviewText: input.reviewText?.trim() || null,
      ratedAt: new Date(),
    },
  });

  let clientSecret: string | null = null;
  if (tipCheck.amountCents > 0) {
    const pi = await stripe.paymentIntents.create({
      amount: tipCheck.amountCents,
      currency: plan ? "usd" : "usd",
      metadata: {
        sessionId: session.id,
        purpose: "tip",
        clientId: session.clientId,
      },
      description: `Tip for session ${session.id}`,
    });
    clientSecret = pi.client_secret;
  }

  // Transition to COMPLETED (idempotent — approveEnd guards on status) which
  // also dispatches the completion payout. Safe to call even with a pending
  // tip PaymentIntent; the tip webhook will land later and bank the tip.
  if (session.status === "PENDING_END_APPROVAL") {
    try {
      await approveEnd(session.id);
    } catch (err) {
      console.error("[end-session] approveEnd failed", err);
    }
  }

  return { status: "ok", clientSecret };
}
