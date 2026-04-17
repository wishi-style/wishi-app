"use client";
import { useState } from "react";
import { OnboardingShell } from "@/components/stylist/onboarding-shell";

export function StepSeven({ initial }: { initial: { philosophy: string } }) {
  const [value, setValue] = useState(initial.philosophy ?? "");
  return (
    <OnboardingShell
      step={7}
      totalSteps={12}
      title="Your styling philosophy"
      subtitle="2–4 sentences on how you approach styling. Clients read this before booking."
      canAdvance={value.trim().length >= 50}
      buildPayload={() => ({ philosophy: value.trim() })}
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={2000}
        placeholder="I style for real life — which means pieces you'll wear every week, not just special occasions…"
        className="min-h-[180px] w-full rounded border border-muted px-3 py-2 text-sm"
      />
      <div className="mt-1 text-right text-xs text-muted-foreground">
        {value.length}/2000
      </div>
    </OnboardingShell>
  );
}
