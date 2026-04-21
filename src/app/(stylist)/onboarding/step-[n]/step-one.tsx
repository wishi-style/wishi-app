"use client";
import { useState } from "react";
import { OnboardingShell } from "@/components/stylist/onboarding-shell";

const GENDERS = [
  { value: "FEMALE", label: "Women" },
  { value: "MALE", label: "Men" },
  { value: "NON_BINARY", label: "Non-binary" },
  { value: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
] as const;

export function StepOne({ initial }: { initial: { genderPreference: string[] } }) {
  const [picked, setPicked] = useState<string[]>(initial.genderPreference ?? []);
  return (
    <OnboardingShell
      step={1}
      totalSteps={12}
      title="Who do you style?"
      subtitle="Pick every gender you'd feel confident styling for."
      canAdvance={picked.length > 0}
      buildPayload={() => ({ genderPreference: picked })}
    >
      <div className="grid grid-cols-2 gap-3">
        {GENDERS.map((g) => (
          <button
            key={g.value}
            type="button"
            onClick={() =>
              setPicked((prev) =>
                prev.includes(g.value) ? prev.filter((v) => v !== g.value) : [...prev, g.value]
              )
            }
            className={`rounded-lg border p-4 text-sm ${picked.includes(g.value) ? "border-foreground bg-foreground text-background" : "border-muted"}`}
          >
            {g.label}
          </button>
        ))}
      </div>
    </OnboardingShell>
  );
}
