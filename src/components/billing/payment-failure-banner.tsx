"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";

export interface PaymentFailureBannerProps {
  subscriptionId: string;
  compact?: boolean;
}

export function PaymentFailureBanner({
  subscriptionId,
  compact = false,
}: PaymentFailureBannerProps) {
  const [isPending, startTransition] = useTransition();

  const retry = () => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/subscriptions/${subscriptionId}/retry-payment`, {
          method: "POST",
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          status?: string;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Retry failed");
        toast.success(
          data.status === "paid"
            ? "Payment successful — your session is active again"
            : "Retry started"
        );
        // Reload so the UI reflects the new status.
        window.location.reload();
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  const openPortal = () => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/billing/portal-session", { method: "POST" });
        const data = (await res.json().catch(() => ({}))) as {
          url?: string;
          error?: string;
        };
        if (!res.ok || !data.url) throw new Error(data.error ?? "Portal unavailable");
        window.location.href = data.url;
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  return (
    <div className={compact ? "rounded-lg bg-destructive/10 border border-destructive/20 p-3" : "bg-destructive/10 border-b border-destructive/20"}>
      <div className={compact ? "flex items-start gap-3" : "mx-auto max-w-6xl px-6 py-3 flex items-center gap-3"}>
        <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-body text-foreground">
            <span className="font-medium">Your last payment failed.</span> Retry or update
            your payment method to resume your sessions.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={retry}
            disabled={isPending}
            className="rounded-full bg-foreground text-background px-4 py-1.5 text-xs font-body font-medium hover:bg-foreground/90 disabled:opacity-60 transition-colors"
          >
            Retry Payment
          </button>
          <button
            onClick={openPortal}
            disabled={isPending}
            className="rounded-full border border-border px-4 py-1.5 text-xs font-body hover:bg-muted disabled:opacity-60 transition-colors"
          >
            Update Payment Method
          </button>
        </div>
      </div>
    </div>
  );
}
