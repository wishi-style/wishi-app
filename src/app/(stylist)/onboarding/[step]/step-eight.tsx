"use client";
import { useState } from "react";
import { OnboardingShell } from "@/components/stylist/onboarding-shell";

export function StepEight({
  initial,
}: {
  initial: { bio: string; yearsExperience: number };
}) {
  const [bio, setBio] = useState(initial.bio ?? "");
  const [years, setYears] = useState<number>(initial.yearsExperience ?? 0);
  return (
    <OnboardingShell
      step={8}
      totalSteps={12}
      title="Your bio"
      subtitle="A short intro. Mention where you've worked, what you love, what makes you you."
      canAdvance={bio.trim().length >= 50 && years >= 0}
      buildPayload={() => ({ bio: bio.trim(), yearsExperience: years })}
    >
      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        maxLength={2000}
        className="min-h-[160px] w-full rounded border border-muted px-3 py-2 text-sm"
      />
      <div className="mt-1 text-right text-xs text-muted-foreground">{bio.length}/2000</div>

      <div className="mt-4">
        <label className="text-sm text-muted-foreground">Years of experience</label>
        <input
          type="number"
          min={0}
          max={80}
          value={years}
          onChange={(e) => setYears(parseInt(e.target.value, 10) || 0)}
          className="mt-1 w-32 rounded border border-muted px-3 py-2"
        />
      </div>
    </OnboardingShell>
  );
}
