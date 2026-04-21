"use client";
import { useState } from "react";
import { OnboardingShell } from "@/components/stylist/onboarding-shell";

export function StepEleven({ initial }: { initial: { instagramHandle: string } }) {
  const [value, setValue] = useState(initial.instagramHandle ?? "");
  return (
    <OnboardingShell
      step={11}
      totalSteps={12}
      title="Instagram (optional)"
      subtitle="Clients love browsing your real-world work. Skip if you'd rather not link."
      canAdvance
      buildPayload={() => ({ instagramHandle: value.trim() || null })}
    >
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">@</span>
        <input
          value={value.replace(/^@/, "")}
          onChange={(e) => setValue(e.target.value)}
          placeholder="your_handle"
          className="flex-1 rounded border border-muted px-3 py-2"
        />
      </div>
    </OnboardingShell>
  );
}
