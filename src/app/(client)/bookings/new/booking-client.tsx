"use client";

import { useState } from "react";
import type { Plan } from "@/generated/prisma/client";
import { PlanSelector } from "@/components/booking/plan-selector";
import { createCheckout } from "./actions";

interface Props {
  plans: Plan[];
  stylistId: string | null;
}

export function BookingClient({ plans, stylistId }: Props) {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [isSubscription, setIsSubscription] = useState(false);

  function handleSelect(type: string) {
    setSelectedType(type);
    // Reset subscription toggle for Lux
    if (type === "LUX") {
      setIsSubscription(false);
    }
  }

  return (
    <form action={createCheckout}>
      <input type="hidden" name="planType" value={selectedType ?? ""} />
      <input type="hidden" name="stylistId" value={stylistId ?? ""} />
      <input type="hidden" name="isSubscription" value={String(isSubscription)} />

      <PlanSelector
        plans={plans}
        selectedType={selectedType}
        isSubscription={isSubscription}
        onSelect={handleSelect}
        onToggleSubscription={setIsSubscription}
      />

      <div className="mt-8">
        <button
          type="submit"
          disabled={!selectedType}
          className="w-full rounded-full bg-black px-8 py-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 sm:w-auto"
        >
          {isSubscription ? "Start Free Trial" : "Proceed to Checkout"}
        </button>
      </div>
    </form>
  );
}
