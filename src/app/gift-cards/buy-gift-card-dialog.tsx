"use client";

import * as React from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type ButtonVariant =
  | "default"
  | "destructive"
  | "outline"
  | "secondary"
  | "ghost"
  | "link";

interface Props {
  isAuthed: boolean;
  /** Pre-selected amount in cents. Null opens the dialog with empty amount. */
  defaultAmountInCents?: number | null;
  /** Rendered label for the trigger button. */
  label?: string;
  /** Optional variant + className for the trigger button. */
  variant?: ButtonVariant;
  className?: string;
}

/**
 * Buy Gift Card dialog. POSTs to /api/gift-cards and redirects the window
 * to the Stripe Checkout URL returned. The /api/gift-cards route requires
 * auth; when the viewer isn't signed in we swap the submit button for a
 * sign-in CTA instead of letting the POST 401.
 */
export function BuyGiftCardDialog({
  isAuthed,
  defaultAmountInCents,
  label = "Buy gift card",
  variant = "default",
  className,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [amountDollars, setAmountDollars] = React.useState<string>(
    defaultAmountInCents != null ? String(defaultAmountInCents / 100) : "",
  );
  const [recipientEmail, setRecipientEmail] = React.useState("");
  const [recipientName, setRecipientName] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amountInCents = Math.round(Number(amountDollars) * 100);
    if (!Number.isFinite(amountInCents) || amountInCents < 1000) {
      setError("Minimum gift amount is $10.");
      return;
    }
    if (!recipientEmail.trim()) {
      setError("Recipient email is required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/gift-cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amountInCents,
          recipientEmail: recipientEmail.trim(),
          recipientName: recipientName.trim() || undefined,
          message: message.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        url?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.url) {
        setError(data?.error ?? "Could not start checkout.");
        setSubmitting(false);
        return;
      }
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        className={className}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send a Wishi gift card</DialogTitle>
          <DialogDescription>
            Pay with Stripe, and we&apos;ll email the recipient their codes.
          </DialogDescription>
        </DialogHeader>

        {isAuthed ? (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div>
              <label
                htmlFor="gc-amount"
                className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground"
              >
                Amount (USD)
              </label>
              <input
                id="gc-amount"
                type="number"
                min={10}
                step={5}
                inputMode="decimal"
                value={amountDollars}
                onChange={(e) => setAmountDollars(e.target.value)}
                placeholder="100"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
                required
              />
            </div>
            <div>
              <label
                htmlFor="gc-email"
                className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground"
              >
                Recipient email
              </label>
              <input
                id="gc-email"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="friend@example.com"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
                required
              />
            </div>
            <div>
              <label
                htmlFor="gc-name"
                className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground"
              >
                Recipient name (optional)
              </label>
              <input
                id="gc-name"
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="gc-message"
                className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground"
              >
                Message (optional)
              </label>
              <textarea
                id="gc-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="Happy birthday — thought you'd love a styling session."
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button
              type="submit"
              disabled={submitting}
              className="w-full"
            >
              {submitting ? "Starting checkout…" : "Continue to payment"}
            </Button>
          </form>
        ) : (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Sign in to buy a gift card — we use your account to send you a
              receipt and let you see the codes after checkout.
            </p>
            <Link
              href="/sign-in?next=/gift-cards"
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-foreground px-4 text-sm font-medium text-background hover:bg-foreground/90"
            >
              Sign in to continue
            </Link>
          </div>
        )}
        </DialogContent>
      </Dialog>
    </>
  );
}
