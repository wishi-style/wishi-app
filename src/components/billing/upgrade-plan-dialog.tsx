"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { PlanType } from "@/generated/prisma/client";

type UpgradeTier = "MAJOR" | "LUX";

interface PlanOption {
  tier: UpgradeTier;
  name: string;
  priceDollars: number;
  features: string[];
}

const MAJOR_FEATURES = [
  "5 Style boards",
  "5 Revisions",
  "Closet styling and outfit building",
  "Personal style and beauty advice",
];

const LUX_FEATURES = [
  "A 30-minute intro call for your stylist to learn your style and goals.",
  "Up to 8 expertly curated Style Boards",
  "Two seasonal capsules to build a smarter wardrobe",
  "Virtual fitting room for final polish",
  "Free & Priority Shipping",
];

export interface UpgradePlanDialogProps {
  sessionId: string;
  currentPlan: PlanType;
  majorPriceDollars: number;
  luxPriceDollars: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UpgradePlanDialog({
  sessionId,
  currentPlan,
  majorPriceDollars,
  luxPriceDollars,
  open,
  onOpenChange,
}: UpgradePlanDialogProps) {
  const plans: PlanOption[] = [
    { tier: "MAJOR", name: "Wishi Major", priceDollars: majorPriceDollars, features: MAJOR_FEATURES },
    { tier: "LUX", name: "Wishi Lux", priceDollars: luxPriceDollars, features: LUX_FEATURES },
  ];

  const availablePlans = plans.filter((p) => {
    if (currentPlan === "MINI") return true;
    if (currentPlan === "MAJOR") return p.tier === "LUX";
    return false;
  });

  const [selected, setSelected] = useState<UpgradeTier>(availablePlans[0]?.tier ?? "MAJOR");
  const [isPending, startTransition] = useTransition();

  const currentLabel = currentPlan === "MINI" ? "Mini" : "Major";

  const handleUpgrade = () => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/upgrade`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetPlan: selected }),
        });
        const data = await res.json();
        if (!res.ok || !data.url) {
          throw new Error(data.error ?? "Could not start upgrade");
        }
        window.location.href = data.url;
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  if (availablePlans.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-8 gap-0 text-center max-h-[90vh] overflow-y-auto">
        <h2 className="font-display text-2xl mb-1">Upgrade your plan</h2>
        <p className="font-body text-muted-foreground text-sm mb-6">
          You&apos;re currently on {currentLabel}. Upgrade for more looks and perks.
        </p>

        <div className="space-y-4 mb-6">
          {availablePlans.map((plan) => {
            const isSelected = selected === plan.tier;
            return (
              <button
                key={plan.tier}
                onClick={() => setSelected(plan.tier)}
                className={cn(
                  "w-full text-left rounded-lg border-2 p-5 transition-colors",
                  isSelected ? "border-foreground" : "border-border hover:border-muted-foreground"
                )}
              >
                <div className="flex items-baseline justify-between mb-4">
                  <h3 className="font-display text-xl">{plan.name}</h3>
                  <span className="font-display text-2xl">${plan.priceDollars}</span>
                </div>
                <ul className="space-y-2.5">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 text-sm font-body text-foreground"
                    >
                      <Plus className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        <button
          onClick={handleUpgrade}
          disabled={isPending}
          className="w-full rounded-2xl bg-foreground text-background py-4 text-base font-body font-medium hover:bg-foreground/90 disabled:opacity-60 transition-colors"
        >
          {isPending
            ? "Starting checkout…"
            : `Upgrade to ${selected === "MAJOR" ? "Major" : "Lux"}`}
        </button>
      </DialogContent>
    </Dialog>
  );
}
