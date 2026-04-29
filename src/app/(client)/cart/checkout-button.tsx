"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

interface Props {
  cartItemIds: string[];
}

/**
 * Routes to the native /checkout page (Loveable contract). The previous
 * Stripe-Hosted entry point (POST /api/payments/checkout → external redirect)
 * is preserved server-side as an admin / rescue path.
 */
export function CheckoutButton({ cartItemIds }: Props) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const go = () => {
    setPending(true);
    router.push(`/checkout?items=${cartItemIds.join(",")}`);
  };

  return (
    <button
      type="button"
      onClick={go}
      disabled={pending || cartItemIds.length === 0}
      className="w-full inline-flex items-center justify-center rounded-full bg-foreground text-background h-12 text-sm font-medium hover:bg-foreground/90 disabled:opacity-50 transition-colors"
    >
      {pending ? "Loading…" : "Proceed to Checkout"}
    </button>
  );
}
