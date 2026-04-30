"use client";

import { useId, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe, type StripeElementsOptions } from "@stripe/stripe-js";
import { ArrowLeftIcon, CheckIcon, CreditCardIcon, LockIcon, PlusIcon, ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface CheckoutItem {
  cartItemId: string;
  inventoryProductId: string;
  title: string;
  brand: string;
  imageUrl: string | null;
  unitAmountInCents: number;
  quantity: number;
}

interface ShippingForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  apt: string;
  city: string;
  state: string;
  zip: string;
}

interface TaxQuote {
  calculationId: string;
  subtotalInCents: number;
  taxInCents: number;
  shippingInCents: number;
  totalInCents: number;
  isPriorityShipping: boolean;
}

type Step = "shipping" | "payment" | "confirmation";

let stripePromise: Promise<Stripe | null> | null = null;
function getStripe(publishableKey: string) {
  if (!publishableKey) return null;
  if (!stripePromise) stripePromise = loadStripe(publishableKey);
  return stripePromise;
}

export function CheckoutClient({
  items,
  publishableKey,
  defaultEmail,
}: {
  items: CheckoutItem[];
  publishableKey: string;
  defaultEmail: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("shipping");

  const [shipping, setShipping] = useState<ShippingForm>({
    firstName: "",
    lastName: "",
    email: defaultEmail,
    phone: "",
    address: "",
    apt: "",
    city: "",
    state: "",
    zip: "",
  });
  const [quote, setQuote] = useState<TaxQuote | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  const subtotalInCents = useMemo(
    () => items.reduce((sum, it) => sum + it.unitAmountInCents * it.quantity, 0),
    [items],
  );

  const isShippingValid =
    shipping.firstName.trim() &&
    shipping.lastName.trim() &&
    shipping.email.trim() &&
    shipping.address.trim() &&
    shipping.city.trim() &&
    shipping.state.trim().length === 2 &&
    shipping.zip.trim();

  function updateShipping(field: keyof ShippingForm, value: string) {
    setShipping((prev) => ({ ...prev, [field]: value }));
  }

  async function handleContinueToPayment() {
    setIsCalculating(true);
    setCalcError(null);
    try {
      const res = await fetch("/api/payments/direct-sale/calculate-tax", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartItemIds: items.map((it) => it.cartItemId),
          address: {
            name: `${shipping.firstName} ${shipping.lastName}`.trim(),
            line1: shipping.address,
            line2: shipping.apt || null,
            city: shipping.city,
            state: shipping.state.toUpperCase(),
            postalCode: shipping.zip,
            country: "US",
          },
        }),
      });
      const data = (await res.json()) as Partial<TaxQuote> & { error?: string };
      if (!res.ok || !data.calculationId) {
        throw new Error(data.error ?? "Tax calculation failed");
      }
      setQuote({
        calculationId: data.calculationId,
        subtotalInCents: data.subtotalInCents ?? subtotalInCents,
        taxInCents: data.taxInCents ?? 0,
        shippingInCents: data.shippingInCents ?? 0,
        totalInCents: data.totalInCents ?? subtotalInCents,
        isPriorityShipping: data.isPriorityShipping ?? false,
      });
      setStep("payment");
    } catch (err) {
      setCalcError(err instanceof Error ? err.message : "Tax calculation failed");
    } finally {
      setIsCalculating(false);
    }
  }

  if (step === "confirmation") {
    return (
      <ConfirmationStep
        items={items}
        totalInCents={quote?.totalInCents ?? subtotalInCents}
        email={shipping.email}
        orderId={orderId}
        onView={() => router.push("/orders")}
        onCloset={() => router.push("/closet")}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <button
        type="button"
        onClick={() => (step === "payment" ? setStep("shipping") : router.push("/cart"))}
        className="mb-8 flex items-center gap-1.5 font-body text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        {step === "payment" ? "Back to Shipping" : "Back to Bag"}
      </button>

      <StepIndicator step={step} />

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {step === "shipping" && (
            <ShippingStepForm
              shipping={shipping}
              update={updateShipping}
              isValid={!!isShippingValid && !isCalculating}
              isLoading={isCalculating}
              error={calcError}
              onSubmit={handleContinueToPayment}
            />
          )}

          {step === "payment" && quote && (
            <PaymentStepWrapper
              publishableKey={publishableKey}
              quote={quote}
              shipping={shipping}
              cartItemIds={items.map((it) => it.cartItemId)}
              onSucceeded={(id) => {
                setOrderId(id);
                setStep("confirmation");
              }}
            />
          )}
        </div>

        <aside className="lg:col-span-2">
          <OrderSummary items={items} quote={quote} subtotalInCents={subtotalInCents} />
        </aside>
      </div>
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const steps: Array<{ label: string; key: "shipping" | "payment" }> = [
    { label: "Shipping", key: "shipping" },
    { label: "Payment", key: "payment" },
  ];
  return (
    <div className="mb-10 flex items-center gap-3">
      {steps.map((s, i) => {
        const isActive = step === s.key;
        const isDone = s.key === "shipping" && step === "payment";
        return (
          <div key={s.key} className="flex items-center gap-3">
            {i > 0 && <div className="h-px w-8 bg-border" />}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full font-body text-xs font-medium transition-colors",
                  isDone || isActive
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {isDone ? "✓" : i + 1}
              </div>
              <span
                className={cn(
                  "font-body text-sm",
                  isActive || isDone ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ShippingStepForm({
  shipping,
  update,
  isValid,
  isLoading,
  error,
  onSubmit,
}: {
  shipping: ShippingForm;
  update: (k: keyof ShippingForm, v: string) => void;
  isValid: boolean;
  isLoading: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  return (
    <div>
      <h2 className="mb-6 font-display text-2xl">Shipping Information</h2>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <InputField
            label="First Name"
            value={shipping.firstName}
            onChange={(v) => update("firstName", v)}
          />
          <InputField
            label="Last Name"
            value={shipping.lastName}
            onChange={(v) => update("lastName", v)}
          />
        </div>
        <InputField
          label="Email"
          type="email"
          value={shipping.email}
          onChange={(v) => update("email", v)}
        />
        <InputField
          label="Phone (optional)"
          type="tel"
          value={shipping.phone}
          onChange={(v) => update("phone", v)}
        />
        <InputField
          label="Street Address"
          value={shipping.address}
          onChange={(v) => update("address", v)}
        />
        <InputField
          label="Apt / Suite (optional)"
          value={shipping.apt}
          onChange={(v) => update("apt", v)}
        />
        <div className="grid grid-cols-3 gap-4">
          <InputField
            label="City"
            value={shipping.city}
            onChange={(v) => update("city", v)}
          />
          <InputField
            label="State"
            value={shipping.state}
            onChange={(v) => update("state", v.slice(0, 2).toUpperCase())}
          />
          <InputField
            label="ZIP"
            value={shipping.zip}
            onChange={(v) => update("zip", v)}
          />
        </div>
      </div>
      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 font-body text-sm text-red-700">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={onSubmit}
        disabled={!isValid}
        className={cn(
          "mt-8 w-full rounded-lg py-3.5 font-body text-sm font-medium transition-colors",
          isValid
            ? "bg-foreground text-background hover:bg-foreground/90"
            : "bg-muted text-muted-foreground cursor-not-allowed",
        )}
      >
        {isLoading ? "Calculating tax…" : "Continue to Payment"}
      </button>
    </div>
  );
}

function PaymentStepWrapper({
  publishableKey,
  quote,
  shipping,
  cartItemIds,
  onSucceeded,
}: {
  publishableKey: string;
  quote: TaxQuote;
  shipping: ShippingForm;
  cartItemIds: string[];
  onSucceeded: (orderId: string) => void;
}) {
  const stripe = getStripe(publishableKey);
  if (!stripe) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center font-body text-sm text-red-700">
        Payment is unavailable right now. Please try again in a few minutes.
      </div>
    );
  }

  // Deferred PaymentIntent pattern: Elements is mounted with `mode: "payment"`
  // and the amount, but we don't create the PaymentIntent until the user
  // clicks Pay. This avoids leaving stale PENDING orders in the DB if the
  // user navigates away from the payment step.
  const options: StripeElementsOptions = {
    mode: "payment",
    amount: quote.totalInCents,
    currency: "usd",
    appearance: { theme: "flat", variables: { fontFamily: "DM Sans, sans-serif" } },
  };

  return (
    <Elements stripe={stripe} options={options}>
      <PaymentInner
        quote={quote}
        shipping={shipping}
        cartItemIds={cartItemIds}
        onSucceeded={onSucceeded}
      />
    </Elements>
  );
}

function PaymentInner({
  quote,
  shipping,
  cartItemIds,
  onSucceeded,
}: {
  quote: TaxQuote;
  shipping: ShippingForm;
  cartItemIds: string[];
  onSucceeded: (orderId: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  // Track the actual amount Stripe will charge (the /intent response is
  // authoritative — it can differ from the preview quote if Stripe Tax
  // returns slightly different totals on the recompute). We surface this
  // on the Pay button label.
  const [chargedTotalInCents, setChargedTotalInCents] = useState(quote.totalInCents);

  async function handlePay() {
    if (!stripe || !elements) return;
    setIsProcessing(true);
    setPaymentError(null);
    try {
      const submit = await elements.submit();
      if (submit.error) {
        throw new Error(submit.error.message ?? "Card details invalid");
      }

      const intentRes = await fetch("/api/payments/direct-sale/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartItemIds,
          email: shipping.email,
          address: {
            name: `${shipping.firstName} ${shipping.lastName}`.trim(),
            line1: shipping.address,
            line2: shipping.apt || null,
            city: shipping.city,
            state: shipping.state.toUpperCase(),
            postalCode: shipping.zip,
            country: "US",
          },
        }),
      });
      const intentData = (await intentRes.json()) as {
        clientSecret?: string;
        orderId?: string;
        totalInCents?: number;
        taxInCents?: number;
        shippingInCents?: number;
        error?: string;
      };
      if (!intentRes.ok || !intentData.clientSecret || !intentData.orderId) {
        throw new Error(intentData.error ?? "Could not start payment");
      }

      // Reconcile Elements + the displayed total with what /intent will
      // actually charge. Stripe's deferred-mode amount must match the PI
      // amount on confirmPayment — without this update, a recomputed tax
      // total would fail confirmPayment with a generic mismatch error.
      if (
        typeof intentData.totalInCents === "number" &&
        intentData.totalInCents !== chargedTotalInCents
      ) {
        elements.update({ amount: intentData.totalInCents });
        setChargedTotalInCents(intentData.totalInCents);
      }

      const { error } = await stripe.confirmPayment({
        elements,
        clientSecret: intentData.clientSecret,
        redirect: "if_required",
        confirmParams: {
          return_url:
            typeof window !== "undefined"
              ? `${window.location.origin}/orders?checkout=success`
              : "/orders",
        },
      });
      if (error) {
        throw new Error(error.message ?? "Payment failed");
      }
      onSucceeded(intentData.orderId);
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div>
      <h2 className="mb-6 font-display text-2xl">Payment Details</h2>
      <div className="mb-6 rounded-xl border border-border p-6">
        <div className="mb-5 flex items-center gap-2">
          <CreditCardIcon className="h-5 w-5 text-muted-foreground" />
          <span className="font-body text-sm font-medium">Credit or Debit Card</span>
        </div>
        <PaymentElement />
      </div>

      <div className="mb-6 flex items-center gap-2 text-muted-foreground">
        <LockIcon className="h-3.5 w-3.5" />
        <span className="font-body text-xs">
          Your payment is securely processed by Stripe. We never store your card details.
        </span>
      </div>

      {paymentError && (
        <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 font-body text-sm text-red-700">
          {paymentError}
        </div>
      )}

      <button
        type="button"
        onClick={handlePay}
        disabled={!stripe || isProcessing}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-lg py-3.5 font-body text-sm font-medium transition-colors",
          !stripe || isProcessing
            ? "bg-muted text-muted-foreground cursor-not-allowed"
            : "bg-foreground text-background hover:bg-foreground/90",
        )}
      >
        {isProcessing ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-background/30 border-t-background" />
            Processing…
          </>
        ) : (
          <>
            <LockIcon className="h-4 w-4" />
            Pay {formatCents(chargedTotalInCents)}
          </>
        )}
      </button>
    </div>
  );
}

function OrderSummary({
  items,
  quote,
  subtotalInCents,
}: {
  items: CheckoutItem[];
  quote: TaxQuote | null;
  subtotalInCents: number;
}) {
  const total = quote?.totalInCents ?? subtotalInCents;
  return (
    <div className="sticky top-24 rounded-xl border border-border bg-card p-6">
      <h3 className="mb-5 font-display text-lg">Order Summary</h3>
      <ul className="mb-6 space-y-4">
        {items.map((item) => (
          <li key={item.cartItemId} className="flex gap-3">
            <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt={item.title}
                  fill
                  sizes="56px"
                  unoptimized
                  className="object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-body text-sm font-medium">{item.brand}</p>
              <p className="truncate font-body text-xs text-muted-foreground">
                {item.title}
              </p>
            </div>
            <span className="font-body text-sm font-medium">
              {formatCents(item.unitAmountInCents * item.quantity)}
            </span>
          </li>
        ))}
      </ul>
      <div className="space-y-2 border-t border-border pt-4">
        <div className="flex justify-between font-body text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatCents(subtotalInCents)}</span>
        </div>
        <div className="flex justify-between font-body text-sm">
          <span className="text-muted-foreground">
            {quote?.isPriorityShipping ? "Priority shipping" : "Shipping"}
          </span>
          <span className={quote?.shippingInCents === 0 ? "text-green-600" : ""}>
            {quote ? (quote.shippingInCents === 0 ? "Free" : formatCents(quote.shippingInCents)) : "—"}
          </span>
        </div>
        <div className="flex justify-between font-body text-sm">
          <span className="text-muted-foreground">Estimated tax</span>
          <span>{quote ? formatCents(quote.taxInCents) : "—"}</span>
        </div>
        <div className="flex justify-between border-t border-border pt-3 font-body">
          <span className="text-sm font-medium">Total</span>
          <span className="text-lg font-semibold">{formatCents(total)}</span>
        </div>
      </div>
    </div>
  );
}

function ConfirmationStep({
  items,
  totalInCents,
  email,
  orderId,
  onView,
  onCloset,
}: {
  items: CheckoutItem[];
  totalInCents: number;
  email: string;
  orderId: string | null;
  onView: () => void;
  onCloset: () => void;
}) {
  const [addedToCloset, setAddedToCloset] = useState(false);
  function handleAddToCloset() {
    // Toast-only — matches Loveable contract literally. Closet auto-creates
    // ClosetItem rows when the Order reaches ARRIVED via the existing
    // `closet/auto-create.ts` hook.
    toast.success(
      `${items.length} ${items.length === 1 ? "item" : "items"} will appear in your closet when delivered`,
    );
    setAddedToCloset(true);
  }
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-foreground">
        <ShieldCheckIcon className="h-8 w-8 text-background" />
      </div>
      <h1 className="mb-2 font-display text-3xl">Order Confirmed</h1>
      <p className="mb-1 font-body text-sm text-muted-foreground">
        Thank you for your purchase!
      </p>
      <p className="mb-8 font-body text-xs text-muted-foreground">
        A confirmation email has been sent to{" "}
        <span className="text-foreground">{email}</span>
        {orderId ? ` · Order ${orderId.slice(0, 8)}` : null}
      </p>

      <div className="mb-4 rounded-xl border border-border bg-card p-6 text-left">
        <p className="mb-3 font-body text-xs uppercase tracking-wider text-muted-foreground">
          Order Summary
        </p>
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.cartItemId} className="flex items-center gap-3">
              <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt={item.title}
                    fill
                    sizes="48px"
                    unoptimized
                    className="object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-body text-sm">{item.brand}</p>
                <p className="truncate font-body text-xs text-muted-foreground">
                  {item.title}
                </p>
              </div>
              <span className="font-body text-sm">
                {formatCents(item.unitAmountInCents * item.quantity)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between border-t border-border pt-4">
          <span className="font-body text-sm font-medium">Total Paid</span>
          <span className="font-body text-sm font-semibold">{formatCents(totalInCents)}</span>
        </div>
      </div>

      <div className="mb-8 rounded-xl border border-border bg-card p-5 text-left">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-secondary">
            <PlusIcon className="h-4 w-4 text-secondary-foreground" />
          </div>
          <div className="flex-1">
            <p className="mb-0.5 font-body text-sm font-medium">Add to Your Closet</p>
            <p className="font-body text-xs text-muted-foreground">
              Save these items for outfit planning and styling sessions.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddToCloset}
            disabled={addedToCloset}
            className={cn(
              "flex-shrink-0 rounded-lg px-4 py-2 font-body text-sm font-medium transition-colors",
              addedToCloset
                ? "cursor-default bg-secondary text-secondary-foreground"
                : "bg-foreground text-background hover:bg-foreground/90",
            )}
          >
            {addedToCloset ? (
              <span className="flex items-center gap-1.5">
                <CheckIcon className="h-4 w-4" />
                Added
              </span>
            ) : (
              "Add All"
            )}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onView}
        className="w-full rounded-lg bg-foreground py-3 font-body text-sm font-medium text-background hover:bg-foreground/90"
      >
        View Orders
      </button>
      <button
        type="button"
        onClick={onCloset}
        className="mt-3 w-full rounded-lg border border-border py-3 font-body text-sm font-medium text-foreground hover:bg-muted/50"
      >
        Go to Closet
      </button>

      <div className="mt-10 flex justify-center">
        <Link
          href="/sessions"
          className="font-body text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Back to your sessions
        </Link>
      </div>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block font-body text-xs text-muted-foreground"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 font-body text-sm text-foreground transition-shadow placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20"
      />
    </div>
  );
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
