"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Step 12 is the Stripe Connect redirect flow. Unlike the earlier steps it
// doesn't use OnboardingShell — the "Continue" button kicks off /connect/start
// which redirects the browser to Stripe. When Stripe bounces back with
// ?status=complete, we call /connect/return to pull the final state.

export function StepTwelve({
  connected,
  status,
}: {
  connected: boolean;
  status: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [statusState, setStatusState] = useState<"idle" | "checking" | "ready" | "pending">(
    connected ? "ready" : "idle"
  );

  // On return from Stripe we get ?status=complete — check Connect state.
  useEffect(() => {
    if (status !== "complete" || statusState === "ready") return;
    setStatusState("checking");
    fetch("/api/stylist/onboarding/connect/return")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Connect check failed");
        setStatusState(body.payoutsEnabled ? "ready" : "pending");
      })
      .catch((err) => setError(String(err.message ?? err)));
  }, [status, statusState]);

  function handleConnect() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/stylist/onboarding/connect/start", {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to start Connect");
        return;
      }
      const { url } = await res.json();
      window.location.href = url;
    });
  }

  async function handleFinish() {
    const res = await fetch("/api/stylist/onboarding/advance", { method: "POST" });
    if (!res.ok) {
      setError("Failed to finalize");
      return;
    }
    router.push("/stylist/dashboard");
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-10">
      <div className="mb-6">
        <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
          Step 12 of 12
        </div>
        <div className="h-1 w-full overflow-hidden rounded bg-muted">
          <div className="h-full bg-foreground" style={{ width: "100%" }} />
        </div>
      </div>
      <h1 className="mb-2 text-3xl font-semibold">Connect Stripe to get paid</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        We use Stripe Connect for payouts. You&apos;ll create (or sign in to) a
        Stripe account on their site, then come back here to finish.
      </p>

      {error && <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {statusState === "ready" ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          Stripe Connect complete. You&apos;re ready for payouts.
        </div>
      ) : statusState === "pending" ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Stripe is still reviewing your account. You can finish here and come
          back later — payouts will unlock automatically.
        </div>
      ) : statusState === "checking" ? (
        <div className="text-sm text-muted-foreground">Checking Stripe status…</div>
      ) : (
        <button
          type="button"
          onClick={handleConnect}
          disabled={isPending}
          className="w-full rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background disabled:opacity-50"
        >
          {isPending ? "Redirecting to Stripe…" : "Connect Stripe"}
        </button>
      )}

      {(statusState === "ready" || statusState === "pending") && (
        <button
          type="button"
          onClick={handleFinish}
          className="mt-4 w-full rounded-full border border-muted px-6 py-3 text-sm"
        >
          Finish onboarding
        </button>
      )}
    </div>
  );
}
