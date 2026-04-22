"use client";

import * as React from "react";
import { toast } from "sonner";

interface Props {
  cartItemIds: string[];
}

/**
 * Client-side redirector for the Wishi Checkout flow. The server route
 * POST /api/payments/checkout consumes JSON `{ cartItemIds }` and returns
 * `{ url }` for a Stripe-hosted Checkout session — not a redirect itself,
 * so a plain HTML form can't be the entry point. On success we navigate
 * to Stripe. On failure we show a toast and keep the user on the page.
 */
export function CheckoutButton({ cartItemIds }: Props) {
  const [pending, setPending] = React.useState(false);

  const go = async () => {
    setPending(true);
    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cartItemIds }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Checkout failed");
      }
      window.location.href = data.url;
    } catch (err) {
      toast.error((err as Error).message);
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={go}
      disabled={pending || cartItemIds.length === 0}
      className="w-full inline-flex items-center justify-center rounded-full bg-foreground text-background h-12 text-sm font-medium hover:bg-foreground/90 disabled:opacity-50 transition-colors"
    >
      {pending ? "Redirecting…" : "Proceed to Checkout"}
    </button>
  );
}
