"use client";
import { OnboardingShell } from "@/components/stylist/onboarding-shell";

export function StepTen() {
  return (
    <OnboardingShell
      step={10}
      totalSteps={12}
      title="Profile created"
      subtitle="You're through the main wizard. Next: your Instagram + payouts setup."
      canAdvance
      skipPersist
      buildPayload={() => ({})}
      primaryLabel="Continue"
    >
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
        Your profile has been saved. An admin will review and approve you for
        matching once payouts are set up.
      </div>
    </OnboardingShell>
  );
}
