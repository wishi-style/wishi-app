"use client";
import Link from "next/link";
import { OnboardingShell } from "@/components/stylist/onboarding-shell";

export function StepFive({
  stylistProfileId: _stylistProfileId,
  styleSpecialties,
}: {
  stylistProfileId: string;
  styleSpecialties: string[];
}) {
  return (
    <OnboardingShell
      step={5}
      totalSteps={12}
      title="Build your profile boards"
      subtitle="Create 3–10 moodboards for each style you claimed. Clients see these first when browsing."
      canAdvance
      buildPayload={() => ({ confirmed: true })}
    >
      <div className="space-y-4">
        {styleSpecialties.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add style specialties first (step 3), then come back here.
          </p>
        ) : (
          styleSpecialties.map((style) => (
            <div key={style} className="rounded-lg border border-muted p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="font-medium">{style}</div>
                <Link
                  href={`/stylist/profile/boards?style=${encodeURIComponent(style)}`}
                  className="text-xs underline text-muted-foreground"
                >
                  Manage boards →
                </Link>
              </div>
              <p className="text-xs text-muted-foreground">
                Aim for 3+ featured boards so this style shows on your public profile.
              </p>
            </div>
          ))
        )}
      </div>
    </OnboardingShell>
  );
}
