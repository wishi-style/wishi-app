"use client";
import { useState } from "react";
import { OnboardingShell } from "@/components/stylist/onboarding-shell";

const BODY_TYPES = [
  "Petite", "Tall", "Plus", "Athletic", "Curvy", "Pear", "Apple", "Hourglass",
  "Rectangle", "Inverted triangle",
];

export function StepTwo({ initial }: { initial: { bodySpecialties: string[] } }) {
  const [picked, setPicked] = useState<string[]>(initial.bodySpecialties ?? []);
  return (
    <OnboardingShell
      step={2}
      totalSteps={12}
      title="Body types you specialize in"
      subtitle="Pick the shapes you can expertly dress."
      canAdvance={picked.length > 0}
      buildPayload={() => ({ bodySpecialties: picked })}
    >
      <div className="flex flex-wrap gap-2">
        {BODY_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() =>
              setPicked((prev) =>
                prev.includes(t) ? prev.filter((v) => v !== t) : [...prev, t]
              )
            }
            className={`rounded-full border px-4 py-2 text-sm ${picked.includes(t) ? "border-foreground bg-foreground text-background" : "border-muted"}`}
          >
            {t}
          </button>
        ))}
      </div>
    </OnboardingShell>
  );
}
