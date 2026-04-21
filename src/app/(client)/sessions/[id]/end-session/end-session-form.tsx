"use client";

import { useMemo, useState, useTransition } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe, type StripeElementsOptions } from "@stripe/stripe-js";
import { useRouter } from "next/navigation";
import { computeChipAmounts, type TipChipPercentage } from "@/lib/payments/tip-policy";
import { submitEndSessionFeedback } from "./actions";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
let stripePromise: Promise<Stripe | null> | null = null;
function getStripe() {
  if (!publishableKey) return null;
  if (!stripePromise) stripePromise = loadStripe(publishableKey);
  return stripePromise;
}

export type EndSessionFormProps = {
  sessionId: string;
  stylistFirstName: string;
  planPriceCents: number;
};

type TipChoice = { kind: "chip"; percentage: TipChipPercentage } | { kind: "custom" } | { kind: "none" };

export function EndSessionForm(props: EndSessionFormProps) {
  const chips = useMemo(() => computeChipAmounts(props.planPriceCents), [props.planPriceCents]);
  const [tipChoice, setTipChoice] = useState<TipChoice>({ kind: "none" });
  const [customCents, setCustomCents] = useState<number>(0);
  const [rating, setRating] = useState<number>(0);
  const [reviewText, setReviewText] = useState<string>("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, startTransition] = useTransition();
  const router = useRouter();

  const tipAmountCents = (() => {
    if (tipChoice.kind === "chip") {
      return chips.find((c) => c.percentage === tipChoice.percentage)?.amountCents ?? 0;
    }
    if (tipChoice.kind === "custom") return customCents;
    return 0;
  })();

  async function handleSubmit() {
    if (rating < 1) {
      setSubmitError("Pick a star rating");
      return;
    }
    setSubmitError(null);
    startTransition(async () => {
      const result = await submitEndSessionFeedback({
        sessionId: props.sessionId,
        tipCents: tipAmountCents,
        rating,
        reviewText,
      });
      if (result.status === "error") {
        setSubmitError(result.message);
        return;
      }
      if (result.clientSecret) {
        setClientSecret(result.clientSecret);
      } else {
        // No tip — session was approved, go home.
        router.push("/sessions");
      }
    });
  }

  if (clientSecret && getStripe()) {
    const options: StripeElementsOptions = { clientSecret, appearance: { theme: "flat" } };
    return (
      <Elements stripe={getStripe()!} options={options}>
        <TipPaymentForm onDone={() => router.push("/sessions")} />
      </Elements>
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Rate your session
        </h2>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              className={`h-12 w-12 rounded-full border text-xl ${
                n <= rating ? "border-foreground bg-foreground text-background" : "border-muted"
              }`}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
            >
              ★
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Add a tip for {props.stylistFirstName}?
        </h2>
        <div className="grid grid-cols-4 gap-2">
          {chips.map((chip) => (
            <button
              key={chip.percentage}
              type="button"
              onClick={() => setTipChoice({ kind: "chip", percentage: chip.percentage })}
              className={`rounded-lg border p-3 text-sm ${
                tipChoice.kind === "chip" && tipChoice.percentage === chip.percentage
                  ? "border-foreground bg-foreground text-background"
                  : "border-muted"
              }`}
            >
              <div className="font-medium">{chip.percentage}%</div>
              <div className="text-xs">${(chip.amountCents / 100).toFixed(2)}</div>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTipChoice({ kind: "custom" })}
            className={`rounded-lg border p-3 text-sm ${
              tipChoice.kind === "custom"
                ? "border-foreground bg-foreground text-background"
                : "border-muted"
            }`}
          >
            Custom
          </button>
        </div>
        {tipChoice.kind === "custom" && (
          <div className="mt-3">
            <label className="text-sm text-muted-foreground">Amount in dollars</label>
            <input
              type="number"
              min={1}
              step="0.01"
              className="mt-1 w-full rounded border border-muted px-3 py-2"
              onChange={(e) => {
                const dollars = parseFloat(e.target.value);
                setCustomCents(Number.isFinite(dollars) ? Math.round(dollars * 100) : 0);
              }}
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => setTipChoice({ kind: "none" })}
          className={`mt-2 text-xs underline ${
            tipChoice.kind === "none" ? "text-muted-foreground" : "text-foreground"
          }`}
        >
          No tip
        </button>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Anything to share? (Optional)
        </h2>
        <textarea
          className="min-h-[100px] w-full rounded border border-muted px-3 py-2 text-sm"
          maxLength={500}
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value)}
          placeholder="A thoughtful note helps other clients find the right stylist."
        />
        <div className="mt-1 text-right text-xs text-muted-foreground">{reviewText.length}/500</div>
      </section>

      {submitError && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{submitError}</div>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isSubmitting || rating < 1}
        className="w-full rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background disabled:opacity-50"
      >
        {isSubmitting
          ? "Submitting…"
          : tipAmountCents > 0
            ? `Continue to payment — $${(tipAmountCents / 100).toFixed(2)}`
            : "Finish session"}
      </button>
    </div>
  );
}

function TipPaymentForm({ onDone }: { onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleConfirm() {
    if (!stripe || !elements) return;
    setStatus("submitting");
    setErrorMessage(null);
    const { error } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: { return_url: `${window.location.origin}/sessions` },
    });
    if (error) {
      setStatus("error");
      setErrorMessage(error.message ?? "Payment failed");
      return;
    }
    setStatus("success");
    setTimeout(onDone, 1500);
  }

  return (
    <div className="space-y-4">
      <PaymentElement />
      {errorMessage && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{errorMessage}</div>}
      {status === "success" ? (
        <div className="rounded bg-emerald-50 p-3 text-sm text-emerald-700">
          Tip sent — thank you.
        </div>
      ) : (
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!stripe || status === "submitting"}
          className="w-full rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background disabled:opacity-50"
        >
          {status === "submitting" ? "Processing…" : "Pay tip"}
        </button>
      )}
    </div>
  );
}
