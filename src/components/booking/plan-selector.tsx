"use client";

import type { Plan } from "@/generated/prisma/client";

interface PlanSelectorProps {
  plans: Plan[];
  selectedType: string | null;
  isSubscription: boolean;
  onSelect: (type: string) => void;
  onToggleSubscription: (isSubscription: boolean) => void;
}

export function PlanSelector({
  plans,
  selectedType,
  isSubscription,
  onSelect,
  onToggleSubscription,
}: PlanSelectorProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {plans.map((plan) => {
          const isSelected = selectedType === plan.type;
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => onSelect(plan.type)}
              className={`flex flex-col rounded-2xl border-2 p-6 text-left transition-all ${
                isSelected
                  ? "border-black bg-stone-50"
                  : "border-stone-200 hover:border-stone-400"
              }`}
            >
              <h3 className="font-serif text-xl font-medium text-stone-900">
                {plan.name}
              </h3>
              <p className="mt-1 text-2xl font-light text-stone-900">
                ${(plan.priceInCents / 100).toFixed(0)}
              </p>
              <div className="mt-4 space-y-1 text-sm text-stone-500">
                <p>{plan.moodboards} moodboard</p>
                <p>{plan.styleboards} styleboards</p>
              </div>
              {plan.description && (
                <p className="mt-3 text-xs text-stone-400">{plan.description}</p>
              )}
              {plan.subscriptionAvailable && (
                <span className="mt-3 inline-block rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-500">
                  Subscription available
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Subscription toggle — hidden for Lux */}
      {selectedType && selectedType !== "LUX" && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onToggleSubscription(!isSubscription)}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              isSubscription ? "bg-black" : "bg-stone-300"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                isSubscription ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
          <span className="text-sm text-stone-600">
            Subscribe monthly (3-day free trial)
          </span>
        </div>
      )}
    </div>
  );
}
