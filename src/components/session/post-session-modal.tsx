"use client";

import { useMemo, useState, useTransition } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe, type StripeElementsOptions } from "@stripe/stripe-js";
import { CheckIcon, StarIcon, XIcon } from "lucide-react";
import { computeChipAmounts, type TipChipPercentage } from "@/lib/payments/tip-policy";
import { submitEndSessionFeedback } from "@/app/(client)/sessions/[id]/end-session/actions";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
let stripePromise: Promise<Stripe | null> | null = null;
function getStripe() {
  if (!publishableKey) return null;
  if (!stripePromise) stripePromise = loadStripe(publishableKey);
  return stripePromise;
}

export type PostSessionModalProps = {
  sessionId: string;
  stylistFirstName: string;
  planPriceCents: number;
  referralCode: string;
  onClose: () => void;
};

type TipChoice =
  | { kind: "chip"; percentage: TipChipPercentage }
  | { kind: "custom"; cents: number }
  | { kind: "none" };

type Step = "tip" | "review" | "payment" | "share";

export function PostSessionModal(props: PostSessionModalProps) {
  const [step, setStep] = useState<Step>("tip");
  const [tipChoice, setTipChoice] = useState<TipChoice>({ kind: "none" });
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  const tipAmountCents = useMemo(() => {
    if (tipChoice.kind === "chip") {
      const chip = computeChipAmounts(props.planPriceCents).find(
        (c) => c.percentage === tipChoice.percentage,
      );
      return chip?.amountCents ?? 0;
    }
    if (tipChoice.kind === "custom") return tipChoice.cents;
    return 0;
  }, [tipChoice, props.planPriceCents]);

  const stepNumber = step === "tip" ? 1 : step === "review" || step === "payment" ? 2 : 3;

  function handleSubmitFeedback() {
    if (rating < 1) {
      setSubmitError("Pick a star rating first");
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
        setStep("payment");
      } else {
        setStep("share");
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="post-session-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm"
    >
      <div className="relative mx-4 w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-xl">
        <div className="p-8">
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
          >
            <XIcon className="h-4 w-4" />
          </button>

          <div className="mb-8">
            <StepIndicator step={stepNumber} />
          </div>

          {step === "tip" && (
            <TipStep
              stylistFirstName={props.stylistFirstName}
              planPriceCents={props.planPriceCents}
              tipChoice={tipChoice}
              onChange={setTipChoice}
              onAdvance={() => setStep("review")}
            />
          )}

          {step === "review" && (
            <ReviewStep
              rating={rating}
              reviewText={reviewText}
              onRatingChange={setRating}
              onReviewChange={setReviewText}
              isSubmitting={isSubmitting}
              error={submitError}
              tipAmountCents={tipAmountCents}
              onSubmit={handleSubmitFeedback}
            />
          )}

          {step === "payment" && clientSecret && (
            <PaymentStep
              clientSecret={clientSecret}
              tipAmountCents={tipAmountCents}
              onDone={() => setStep("share")}
            />
          )}

          {step === "share" && (
            <ShareStep
              referralCode={props.referralCode}
              onDone={props.onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {[1, 2, 3].map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-all ${
              s === step
                ? "bg-foreground text-background"
                : s < step
                  ? "bg-accent text-accent-foreground"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {s < step ? <CheckIcon className="h-3.5 w-3.5" /> : s}
          </div>
          {i < 2 && <span className="text-xs text-muted-foreground">›</span>}
        </div>
      ))}
    </div>
  );
}

function TipStep({
  stylistFirstName,
  planPriceCents,
  tipChoice,
  onChange,
  onAdvance,
}: {
  stylistFirstName: string;
  planPriceCents: number;
  tipChoice: TipChoice;
  onChange: (next: TipChoice) => void;
  onAdvance: () => void;
}) {
  const chips = useMemo(() => computeChipAmounts(planPriceCents), [planPriceCents]);
  const showCustom = tipChoice.kind === "custom";
  const customCents = tipChoice.kind === "custom" ? tipChoice.cents : 0;
  const canAdvance = tipChoice.kind === "chip" || (tipChoice.kind === "custom" && tipChoice.cents > 0);

  return (
    <div className="text-center">
      <h2 id="post-session-title" className="font-display text-2xl tracking-tight md:text-3xl">
        Loved your session?
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Your tip goes directly to <span className="font-medium text-foreground">{stylistFirstName}</span>
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        {chips.map((chip) => {
          const active = tipChoice.kind === "chip" && tipChoice.percentage === chip.percentage;
          return (
            <button
              key={chip.percentage}
              type="button"
              onClick={() => onChange({ kind: "chip", percentage: chip.percentage })}
              className={`rounded-full border px-5 py-3 text-center transition-all ${
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-foreground hover:border-foreground/40"
              }`}
            >
              <span className="block text-sm font-medium">{chip.percentage}%</span>
              <span
                className={`block text-xs ${active ? "text-background/70" : "text-muted-foreground"}`}
              >
                ${(chip.amountCents / 100).toFixed(2)}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onChange({ kind: "custom", cents: customCents })}
          className={`rounded-full border px-5 py-4 text-sm font-medium transition-all ${
            showCustom
              ? "border-foreground bg-foreground text-background"
              : "border-dashed border-border text-foreground hover:border-foreground/40"
          }`}
        >
          Custom
        </button>
      </div>

      {showCustom && (
        <div className="mx-auto mt-4 flex max-w-[200px] items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5">
          <span className="text-sm text-muted-foreground">$</span>
          <input
            type="number"
            min={1}
            step="0.01"
            autoFocus
            value={customCents > 0 ? (customCents / 100).toString() : ""}
            onChange={(e) => {
              const dollars = parseFloat(e.target.value);
              const cents = Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;
              onChange({ kind: "custom", cents });
            }}
            placeholder="Amount"
            aria-label="Custom tip amount"
            className="w-full bg-transparent text-center text-sm outline-none placeholder:text-muted-foreground/50"
          />
        </div>
      )}

      <button
        type="button"
        onClick={onAdvance}
        disabled={!canAdvance}
        className="mx-auto mt-8 flex w-full max-w-xs items-center justify-center gap-2 rounded-full bg-foreground py-3 text-sm font-medium text-background transition-all hover:bg-foreground/90 disabled:opacity-30"
      >
        Add tip
      </button>

      <button
        type="button"
        onClick={() => {
          onChange({ kind: "none" });
          onAdvance();
        }}
        className="mx-auto mt-3 block text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
      >
        Skip
      </button>
    </div>
  );
}

function ReviewStep({
  rating,
  reviewText,
  onRatingChange,
  onReviewChange,
  isSubmitting,
  error,
  tipAmountCents,
  onSubmit,
}: {
  rating: number;
  reviewText: string;
  onRatingChange: (n: number) => void;
  onReviewChange: (s: string) => void;
  isSubmitting: boolean;
  error: string | null;
  tipAmountCents: number;
  onSubmit: () => void;
}) {
  const [hoverRating, setHoverRating] = useState(0);
  const ctaLabel = isSubmitting
    ? "Submitting…"
    : tipAmountCents > 0
      ? `Submit & continue to payment`
      : "Submit review";

  return (
    <div className="text-center">
      <h2 className="font-display text-2xl tracking-tight md:text-3xl">Leave Your Review</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Reviews help other clients find the right stylist.
      </p>

      <div className="mt-5 flex justify-center gap-1.5">
        {[1, 2, 3, 4, 5].map((s) => {
          const filled = s <= (hoverRating || rating);
          return (
            <button
              key={s}
              type="button"
              onMouseEnter={() => setHoverRating(s)}
              onMouseLeave={() => setHoverRating(0)}
              onClick={() => onRatingChange(s)}
              aria-label={`${s} star${s > 1 ? "s" : ""}`}
              className="transition-transform hover:scale-110"
            >
              <StarIcon
                className={`h-7 w-7 transition-all ${
                  filled
                    ? "fill-amber-400 text-amber-400"
                    : "fill-none text-muted-foreground/30"
                }`}
              />
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        <textarea
          value={reviewText}
          onChange={(e) => onReviewChange(e.target.value)}
          placeholder="Share your experience…"
          rows={4}
          maxLength={500}
          className="w-full resize-none rounded-lg border border-border bg-muted/40 px-4 py-4 text-sm outline-none placeholder:text-muted-foreground/40 transition-all focus:border-foreground/20"
        />
        <div className="mt-1 text-right text-xs text-muted-foreground">{reviewText.length}/500</div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={rating === 0 || isSubmitting}
        className="mx-auto mt-6 w-full max-w-xs rounded-full bg-foreground py-3 text-sm font-medium text-background transition-all hover:bg-foreground/90 disabled:opacity-30"
      >
        {ctaLabel}
      </button>
    </div>
  );
}

function PaymentStep({
  clientSecret,
  tipAmountCents,
  onDone,
}: {
  clientSecret: string;
  tipAmountCents: number;
  onDone: () => void;
}) {
  const stripe = getStripe();
  if (!stripe) {
    return (
      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          Payment is unavailable right now. Your rating was saved.
        </p>
        <button
          type="button"
          onClick={onDone}
          className="mx-auto mt-6 w-full max-w-xs rounded-full bg-foreground py-3 text-sm font-medium text-background"
        >
          Continue
        </button>
      </div>
    );
  }

  const options: StripeElementsOptions = { clientSecret, appearance: { theme: "flat" } };

  return (
    <div className="text-center">
      <h2 className="font-display text-2xl tracking-tight md:text-3xl">Confirm your tip</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        ${(tipAmountCents / 100).toFixed(2)} — your stylist receives this directly.
      </p>
      <div className="mt-6 text-left">
        <Elements stripe={stripe} options={options}>
          <PaymentInner onDone={onDone} />
        </Elements>
      </div>
    </div>
  );
}

function PaymentInner({ onDone }: { onDone: () => void }) {
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
    });
    if (error) {
      setStatus("error");
      setErrorMessage(error.message ?? "Payment failed");
      return;
    }
    setStatus("success");
    setTimeout(onDone, 800);
  }

  return (
    <div className="space-y-4">
      <PaymentElement />
      {errorMessage && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</div>
      )}
      {status === "success" ? (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-center text-sm text-emerald-700">
          Tip sent — thank you.
        </div>
      ) : (
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!stripe || status === "submitting"}
          className="mx-auto block w-full max-w-xs rounded-full bg-foreground py-3 text-sm font-medium text-background disabled:opacity-50"
        >
          {status === "submitting" ? "Processing…" : "Pay tip"}
        </button>
      )}
    </div>
  );
}

function ShareStep({
  referralCode,
  onDone,
}: {
  referralCode: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const baseUrl =
    typeof window !== "undefined" ? window.location.origin : "https://wishi.me";
  const referralLink = `${baseUrl}/?ref=${referralCode}`;

  function handleCopy() {
    void navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="text-center">
      <h2 className="font-display text-2xl tracking-tight md:text-3xl">
        Share Wishi With Friends
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Give them a discount on their first session
        <br />
        and receive a credit for your next booking.
      </p>

      <div className="mx-auto mt-8 max-w-sm overflow-hidden rounded-2xl bg-foreground p-6 text-center text-background">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">Your reward</p>
        <p className="mt-2 font-display text-3xl tracking-tight">$20 off</p>
        <p className="mt-1 text-xs text-background/60">your next session</p>
      </div>

      <div className="mt-5 flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5">
        <span className="flex-1 truncate text-left text-xs text-muted-foreground" data-testid="referral-link">
          {referralLink}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[10px] font-medium text-background transition-all hover:opacity-90"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <button
        type="button"
        onClick={onDone}
        className="mx-auto mt-6 w-full max-w-xs rounded-full bg-foreground py-3 text-sm font-medium text-background transition-all hover:opacity-90"
      >
        Done
      </button>
    </div>
  );
}
