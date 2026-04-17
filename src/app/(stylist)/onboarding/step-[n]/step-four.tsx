"use client";
import { useState } from "react";
import { OnboardingShell } from "@/components/stylist/onboarding-shell";

export function StepFour() {
  const [input, setInput] = useState("");
  const [brands, setBrands] = useState<string[]>([]);

  function addBrand() {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (brands.includes(trimmed)) return;
    setBrands((prev) => [...prev, trimmed]);
    setInput("");
  }

  return (
    <OnboardingShell
      step={4}
      totalSteps={12}
      title="Brands you love"
      subtitle="Name brands you'd actually recommend. Clients see these on your profile."
      canAdvance
      buildPayload={() => ({ favoriteBrands: brands })}
    >
      <div className="mb-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addBrand();
            }
          }}
          placeholder="e.g. Everlane"
          className="flex-1 rounded border border-muted px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={addBrand}
          className="rounded border border-muted px-3 py-2 text-sm"
        >
          Add
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {brands.map((b) => (
          <span
            key={b}
            className="inline-flex items-center gap-1 rounded-full border border-muted px-3 py-1 text-xs"
          >
            {b}
            <button
              type="button"
              onClick={() => setBrands((prev) => prev.filter((v) => v !== b))}
              aria-label={`Remove ${b}`}
              className="text-muted-foreground"
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </OnboardingShell>
  );
}
