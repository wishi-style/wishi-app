"use client";
import { useState } from "react";
import { OnboardingShell } from "@/components/stylist/onboarding-shell";

export function StepSix() {
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("US");

  const canAdvance = phone.trim().length >= 7 && city.trim().length > 0;

  return (
    <OnboardingShell
      step={6}
      totalSteps={12}
      title="Where are you based?"
      subtitle="Your location helps match clients in your time zone."
      canAdvance={canAdvance}
      buildPayload={() => ({ phone, city, state: state || undefined, country })}
    >
      <div className="space-y-3">
        <div>
          <label className="text-sm text-muted-foreground">Phone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 415 555 1234"
            className="mt-1 w-full rounded border border-muted px-3 py-2"
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">City</label>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="mt-1 w-full rounded border border-muted px-3 py-2"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-muted-foreground">State (optional)</label>
            <input
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="mt-1 w-full rounded border border-muted px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Country</label>
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="mt-1 w-full rounded border border-muted px-3 py-2"
            />
          </div>
        </div>
      </div>
    </OnboardingShell>
  );
}
