"use client";
import { useState } from "react";
import { OnboardingShell } from "@/components/stylist/onboarding-shell";

const CATEGORIES = [
  "Everyday", "Work", "Date night", "Weddings", "Travel", "Athleisure",
  "Formal", "Outerwear", "Accessories",
];
const GENDER_LABELS: Record<string, string> = {
  FEMALE: "Women",
  MALE: "Men",
  NON_BINARY: "Non-binary",
  PREFER_NOT_TO_SAY: "Prefer not to say",
};

export function StepNine({
  initial,
}: {
  initial: { expertiseByGender: Record<string, string[]> };
}) {
  const [map, setMap] = useState<Record<string, string[]>>(initial.expertiseByGender ?? {});
  const genders = Object.keys(GENDER_LABELS);

  function toggle(gender: string, cat: string) {
    setMap((prev) => {
      const existing = prev[gender] ?? [];
      const next = existing.includes(cat)
        ? existing.filter((v) => v !== cat)
        : [...existing, cat];
      return { ...prev, [gender]: next };
    });
  }

  const canAdvance = Object.values(map).some((v) => v.length > 0);

  return (
    <OnboardingShell
      step={9}
      totalSteps={12}
      title="Expertise by category"
      subtitle="For each gender you style, pick the categories you excel at."
      canAdvance={canAdvance}
      buildPayload={() => {
        const filtered: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(map)) {
          if (v.length > 0) filtered[k] = v;
        }
        return { expertiseByGender: filtered };
      }}
    >
      <div className="space-y-5">
        {genders.map((g) => (
          <div key={g}>
            <div className="mb-2 text-sm font-medium">{GENDER_LABELS[g]}</div>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => {
                const on = (map[g] ?? []).includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggle(g, c)}
                    className={`rounded-full border px-3 py-1 text-xs ${on ? "border-foreground bg-foreground text-background" : "border-muted"}`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </OnboardingShell>
  );
}
