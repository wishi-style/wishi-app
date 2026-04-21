"use client";
import { useState } from "react";
import { OnboardingShell } from "@/components/stylist/onboarding-shell";

const STYLES = [
  "Minimalist", "Classic", "Edgy", "Bohemian", "Preppy", "Streetwear",
  "Romantic", "Sporty", "Avant-garde", "Eclectic",
];
const LEVEL_LABELS = { 1: "Terrible", 2: "Pretty Good", 3: "Expert!" } as const;

export function StepThree({
  initial,
}: {
  initial: { styleSpecialties: string[]; styleExpertiseLevels: Record<string, number> };
}) {
  const [picked, setPicked] = useState<string[]>(initial.styleSpecialties ?? []);
  const [levels, setLevels] = useState<Record<string, number>>(initial.styleExpertiseLevels ?? {});

  function togglePick(style: string) {
    setPicked((prev) => {
      if (prev.includes(style)) {
        setLevels((l) => {
          const copy = { ...l };
          delete copy[style];
          return copy;
        });
        return prev.filter((v) => v !== style);
      }
      setLevels((l) => ({ ...l, [style]: 2 })); // default level 2
      return [...prev, style];
    });
  }

  const canAdvance =
    picked.length > 0 && picked.every((s) => levels[s] != null);

  return (
    <OnboardingShell
      step={3}
      totalSteps={12}
      title="Styles you've mastered"
      subtitle="Tap each style, then set how good you are (1–3)."
      canAdvance={canAdvance}
      buildPayload={() => ({
        styleSpecialties: picked,
        styleExpertiseLevels: Object.fromEntries(
          Object.entries(levels).filter(([k]) => picked.includes(k))
        ),
      })}
    >
      <div className="space-y-3">
        {STYLES.map((s) => {
          const isPicked = picked.includes(s);
          const level = levels[s];
          return (
            <div key={s} className="rounded-lg border border-muted p-3">
              <button
                type="button"
                onClick={() => togglePick(s)}
                className={`w-full text-left text-sm font-medium ${isPicked ? "text-foreground" : "text-muted-foreground"}`}
              >
                {isPicked ? "✓ " : ""}
                {s}
              </button>
              {isPicked && (
                <div className="mt-3 flex gap-2">
                  {([1, 2, 3] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setLevels((l) => ({ ...l, [s]: n }))}
                      className={`flex-1 rounded border px-3 py-1.5 text-xs ${level === n ? "border-foreground bg-foreground text-background" : "border-muted"}`}
                    >
                      {n} · {LEVEL_LABELS[n]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </OnboardingShell>
  );
}
