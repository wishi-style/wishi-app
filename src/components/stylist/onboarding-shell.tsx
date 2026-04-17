"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Shared container for wizard steps — handles the Save + Advance dance, shows
// progress + error state, forwards payload to /api/stylist/onboarding/save.

export type OnboardingShellProps = {
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  canAdvance: boolean;
  // Children return the payload to persist on Save.
  buildPayload: () => Record<string, unknown> | null;
  children: React.ReactNode;
  skipPersist?: boolean; // step 10 & step 12 just advance
  nextHref?: string; // override the default /onboarding/step-N+1 route
  primaryLabel?: string;
};

export function OnboardingShell(props: OnboardingShellProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const pct = Math.round((props.step / props.totalSteps) * 100);

  async function handleNext() {
    setErrorMessage(null);
    startTransition(async () => {
      if (!props.skipPersist) {
        const payload = props.buildPayload();
        if (payload === null) {
          setErrorMessage("Fill in the required fields before continuing");
          return;
        }
        const saveRes = await fetch("/api/stylist/onboarding/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step: props.step, payload }),
        });
        if (!saveRes.ok) {
          const body = await saveRes.json().catch(() => ({}));
          setErrorMessage(body.error ?? "Failed to save");
          return;
        }
      }
      const advanceRes = await fetch("/api/stylist/onboarding/advance", {
        method: "POST",
      });
      if (!advanceRes.ok) {
        const body = await advanceRes.json().catch(() => ({}));
        setErrorMessage(body.error ?? "Failed to advance");
        return;
      }
      const { onboardingStep } = await advanceRes.json();
      router.push(props.nextHref ?? `/onboarding/step-${onboardingStep}`);
    });
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-10">
      <div className="mb-6">
        <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
          Step {props.step} of {props.totalSteps}
        </div>
        <div className="h-1 w-full overflow-hidden rounded bg-muted">
          <div className="h-full bg-foreground transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <h1 className="mb-2 text-3xl font-semibold">{props.title}</h1>
      {props.subtitle && <p className="mb-8 text-sm text-muted-foreground">{props.subtitle}</p>}

      <div className="mb-8">{props.children}</div>

      {errorMessage && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="flex items-center justify-between">
        {props.step > 1 ? (
          <button
            type="button"
            onClick={() => router.push(`/onboarding/step-${props.step - 1}`)}
            className="text-sm text-muted-foreground underline"
          >
            Back
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={handleNext}
          disabled={!props.canAdvance || isPending}
          className="rounded-full bg-foreground px-6 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {isPending ? "Saving…" : (props.primaryLabel ?? "Continue")}
        </button>
      </div>
    </div>
  );
}
