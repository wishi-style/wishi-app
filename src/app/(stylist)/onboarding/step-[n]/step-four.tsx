"use client";
import { useState } from "react";
import { OnboardingShell } from "@/components/stylist/onboarding-shell";

const MAX_BRANDS = 30;

type StepFourProps = {
  initial?: { favoriteBrands?: string[] };
};

export function StepFour({ initial }: StepFourProps = {}) {
  const [input, setInput] = useState("");
  // Prefill from User.favoriteBrands so reload/revisit doesn't overwrite an
  // existing list with an empty array when the user clicks Continue.
  const [brands, setBrands] = useState<string[]>(initial?.favoriteBrands ?? []);
  const atCap = brands.length >= MAX_BRANDS;

  function addBrand() {
    if (atCap) return;
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
          placeholder={atCap ? `Max ${MAX_BRANDS} brands reached` : "e.g. Everlane"}
          disabled={atCap}
          className="flex-1 rounded border border-muted px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="button"
          onClick={addBrand}
          disabled={atCap}
          className="rounded border border-muted px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
      </div>
      <div className="mb-2 text-xs text-muted-foreground">
        {brands.length} / {MAX_BRANDS}
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
