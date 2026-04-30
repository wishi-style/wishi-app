"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ChevronLeftIcon } from "lucide-react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";
import { createCheckout } from "@/app/(client)/bookings/new/actions";

export interface SessionCheckoutClientProps {
  stylist: {
    id: string;
    firstName: string;
    avatarUrl: string | null;
  } | null;
  planType: "MINI" | "MAJOR" | "LUX";
  planName: string;
  oneTimeDollars: number;
  defaultEmail: string;
}

/**
 * Visual port of Loveable's SessionCheckout.tsx.
 *
 * Loveable collects card data into local state and persists to localStorage —
 * a mock flow. Wishi uses Stripe Hosted Checkout instead, so the right-column
 * payment panel keeps Loveable's chrome (heading + email field + lock copy)
 * but the Pay CTA is wired to the existing `createCheckout` server action.
 * Stripe collects the card on stripe.com and redirects to /bookings/success.
 *
 * Promo code field is visual-only — applying real promos is wired through
 * Stripe Coupons on the Hosted Checkout page itself, not here.
 */
export function SessionCheckoutClient({
  stylist,
  planType,
  planName,
  oneTimeDollars,
  defaultEmail,
}: SessionCheckoutClientProps) {
  const router = useRouter();

  // Lux is one-time only per locked decisions 2026-04-07.
  const luxOnly = planType === "LUX";
  const [frequency, setFrequency] = useState<"one-time" | "monthly">(
    luxOnly ? "one-time" : "one-time",
  );
  const [email, setEmail] = useState(defaultEmail);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  // Subscription pricing is roughly 90% of one-time per Loveable's planData.
  // Real per-plan monthly prices come from the Plan table; Stripe applies the
  // accurate amount on Hosted Checkout. The number below is for visual
  // parity with Loveable's frequency toggle only.
  const monthlyDollars = Math.round(oneTimeDollars * 0.9);

  const basePrice = frequency === "monthly" ? monthlyDollars : oneTimeDollars;
  const discount = appliedPromo === "WISHI" ? basePrice : 0;
  const total = Math.max(0, basePrice - discount);

  function applyPromo() {
    const code = promoCode.trim().toUpperCase();
    if (code === "WISHI") {
      setAppliedPromo("WISHI");
      setPromoError(null);
    } else {
      setAppliedPromo(null);
      setPromoError("Invalid promo code");
    }
  }

  function removePromo() {
    setAppliedPromo(null);
    setPromoCode("");
    setPromoError(null);
    setPromoOpen(false);
  }

  const stylistFirstName = stylist?.firstName ?? "your stylist";

  return (
    <div className="min-h-screen bg-white">
      {/* Back */}
      <div className="container max-w-5xl pt-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1 font-body text-sm text-foreground hover:text-foreground/70 transition-colors"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Back
        </button>
      </div>

      {/* Stylist header */}
      <div className="text-center pt-6 pb-8">
        <div className="relative mx-auto mb-3 h-20 w-20 overflow-hidden rounded-full border-2 border-border bg-muted">
          {stylist?.avatarUrl ? (
            <Image
              src={stylist.avatarUrl}
              alt={stylistFirstName}
              fill
              sizes="80px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-display text-2xl text-muted-foreground">
              {stylistFirstName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <h1 className="font-display text-2xl">{stylistFirstName}</h1>
      </div>

      {/* Frequency toggle (Lux is one-time only) */}
      {!luxOnly && (
        <div className="container max-w-2xl mb-10">
          <p className="mb-4 text-center font-body text-sm text-foreground">
            How often would you like a styling session?
          </p>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setFrequency("monthly")}
              className={cn(
                "rounded-lg border-2 p-5 text-left transition-colors",
                frequency === "monthly"
                  ? "border-foreground"
                  : "border-border hover:border-foreground/30",
              )}
            >
              <div className="mb-1 flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border-2",
                    frequency === "monthly"
                      ? "border-foreground"
                      : "border-muted-foreground/40",
                  )}
                >
                  {frequency === "monthly" && (
                    <div className="h-2.5 w-2.5 rounded-full bg-foreground" />
                  )}
                </div>
                <span className="font-body text-sm font-semibold">
                  Monthly Membership
                </span>
                <span className="ml-auto font-body text-sm font-semibold">
                  ${monthlyDollars}
                </span>
              </div>
              <p className="ml-8 font-body text-xs text-[hsl(170,60%,40%)]">
                3-Day Free Trial
              </p>
            </button>

            <button
              type="button"
              onClick={() => setFrequency("one-time")}
              className={cn(
                "rounded-lg border-2 p-5 text-left transition-colors",
                frequency === "one-time"
                  ? "border-foreground"
                  : "border-border hover:border-foreground/30",
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border-2",
                    frequency === "one-time"
                      ? "border-foreground"
                      : "border-muted-foreground/40",
                  )}
                >
                  {frequency === "one-time" && (
                    <div className="h-2.5 w-2.5 rounded-full bg-foreground" />
                  )}
                </div>
                <span className="font-body text-sm font-semibold">
                  One-time {planName}
                </span>
                <span className="ml-auto font-body text-sm font-semibold">
                  ${oneTimeDollars}
                </span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Main content: Summary + Payment */}
      <div className="container max-w-5xl pb-20">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2 md:gap-16">
          {/* Order Summary */}
          <div>
            <p className="mb-1 font-body text-sm text-muted-foreground">
              Pay Wishi Fashion, Inc.
            </p>
            <p className="mb-6 font-display text-4xl">${total}</p>

            <div className="space-y-4">
              <div className="flex justify-between font-body text-sm">
                <span>Session - {planName}</span>
                <span>${basePrice}</span>
              </div>
              <div className="border-t border-border" />
              <div className="flex justify-between font-body text-sm">
                <span>Subtotal</span>
                <span>${basePrice}</span>
              </div>

              {!promoOpen && !appliedPromo ? (
                <button
                  type="button"
                  onClick={() => setPromoOpen(true)}
                  className="inline-flex items-center rounded-md border border-border px-4 py-2 font-body text-sm transition-colors hover:bg-muted/50"
                >
                  Add promotion code
                </button>
              ) : appliedPromo ? (
                <div className="flex items-center justify-between font-body text-sm">
                  <span className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      {appliedPromo}
                    </span>
                    <span className="text-muted-foreground">applied</span>
                    <button
                      type="button"
                      onClick={removePromo}
                      className="text-xs text-muted-foreground underline hover:text-foreground"
                    >
                      Remove
                    </button>
                  </span>
                  <span className="text-emerald-700">−${discount}</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={promoCode}
                      onChange={(e) => {
                        setPromoCode(e.target.value);
                        setPromoError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          applyPromo();
                        }
                      }}
                      placeholder="Promo code"
                      className="flex-1 rounded-md border border-border px-3 py-2 font-body text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
                    />
                    <button
                      type="button"
                      onClick={applyPromo}
                      className="rounded-md border border-border px-4 py-2 font-body text-sm transition-colors hover:bg-muted/50"
                    >
                      Apply
                    </button>
                  </div>
                  {promoError && (
                    <p className="font-body text-xs text-destructive">
                      {promoError}
                    </p>
                  )}
                </div>
              )}

              <div className="border-t border-border" />
              <div className="flex justify-between font-body text-sm font-semibold">
                <span>Total due</span>
                <span>${total}</span>
              </div>
            </div>
          </div>

          {/* Payment column — Stripe Hosted (replaces Loveable's mock card form) */}
          <div className="rounded-xl border border-border bg-card p-6 md:p-8">
            <h3 className="mb-3 font-body text-sm font-semibold">
              Contact information
            </h3>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="mb-6 w-full rounded-md border border-border px-4 py-3 font-body text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
            />

            <h3 className="mb-3 font-body text-sm font-semibold">
              Payment method
            </h3>
            <div className="mb-6 rounded-lg border border-border bg-muted/20 p-4">
              <p className="font-body text-xs text-muted-foreground">
                You&rsquo;ll enter your card details on the next step. Wishi uses
                Stripe Checkout — your card is never stored on our servers.
              </p>
            </div>

            <form action={createCheckout}>
              <input type="hidden" name="planType" value={planType} />
              <input
                type="hidden"
                name="stylistId"
                value={stylist?.id ?? ""}
              />
              <input
                type="hidden"
                name="isSubscription"
                value={frequency === "monthly" ? "true" : "false"}
              />
              <PayButton total={total} />
            </form>

            <p className="mt-3 text-center font-body text-[10px] leading-relaxed text-muted-foreground">
              By confirming your payment, you allow Wishi Fashion, Inc. to
              charge your card for this payment and future payments in
              accordance with their terms.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PayButton({ total }: { total: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-foreground py-4 font-body text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-60"
    >
      {pending ? "Loading…" : `Pay $${total}`}
    </button>
  );
}
