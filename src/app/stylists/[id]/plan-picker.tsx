"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanTier } from "@/lib/ui/plan-copy";

interface PlanRow {
  id: PlanTier;
  name: string;
  priceDisplay: string;
  popular?: boolean;
  summary: string;
}

interface Props {
  stylistProfileId: string;
  stylistFirstName: string;
  signedIn: boolean;
  plans: PlanRow[];
}

/**
 * Loveable's `<PlanPicker>` from StylistProfile.tsx — three plan cards
 * (Mini / Major / Lux), Major flagged as "Popular", a Continue CTA that
 * carries the picked plan to /select-plan, and a "Learn more" link to
 * /pricing.
 *
 * Differences vs Loveable:
 *   - Prices come from `getPlanPricesForUi()` (server) — Loveable
 *     hardcodes them.
 *   - The "2 seasonal capsules · Virtual fitting" Lux summary is locked
 *     out per CLAUDE.md (capsules dropped, virtual-fitting non-port).
 *   - Continue routes through /select-plan; unauthed users get the
 *     Clerk sign-up modal first (mirrors `<ContinueWithStylistButton>`).
 */
export function PlanPicker({
  stylistProfileId,
  stylistFirstName,
  signedIn,
  plans,
}: Props) {
  const [selected, setSelected] = useState<PlanTier>("MAJOR");
  const router = useRouter();
  const { openSignUp } = useClerk();

  const target = `/select-plan?stylistId=${stylistProfileId}&plan=${selected.toLowerCase()}`;

  function go() {
    if (signedIn) {
      router.push(target);
      return;
    }
    openSignUp({
      unsafeMetadata: { intentStylistProfileId: stylistProfileId },
      forceRedirectUrl: target,
    });
  }

  const selectedPlan = plans.find((p) => p.id === selected) ?? plans[0];

  return (
    <section className="border-t border-border">
      <div className="container mx-auto max-w-5xl px-6 py-10 md:py-14">
        <h2 className="mb-2 text-center font-display text-2xl md:text-3xl">
          Choose your plan
        </h2>
        <p className="mb-8 text-center font-body text-sm text-muted-foreground">
          Select a plan and start styling with {stylistFirstName}
        </p>

        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-3">
          {plans.map((plan) => {
            const isSelected = selected === plan.id;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelected(plan.id)}
                aria-pressed={isSelected}
                className={cn(
                  "relative rounded-xl border-2 p-5 text-left transition-all duration-200",
                  isSelected
                    ? "border-foreground shadow-md"
                    : "border-border hover:border-foreground/30",
                )}
              >
                {plan.popular && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-3 py-0.5 font-body text-[10px] uppercase tracking-widest text-background">
                    Popular
                  </span>
                )}
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="font-display text-lg">{plan.name}</h3>
                  {isSelected && (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground">
                      <CheckIcon className="h-3 w-3 text-background" />
                    </div>
                  )}
                </div>
                <p className="mb-3 font-display text-2xl">{plan.priceDisplay}</p>
                <p className="font-body text-xs leading-relaxed text-muted-foreground">
                  {plan.summary}
                </p>
              </button>
            );
          })}
        </div>

        <div className="mt-8 space-y-3 text-center">
          <button
            type="button"
            onClick={go}
            className="rounded-full bg-foreground px-12 py-3.5 font-body text-sm font-medium text-background transition-colors hover:bg-foreground/90"
          >
            Continue with {selectedPlan.name}
          </button>
          <div>
            <Link
              href="/pricing"
              className="font-body text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Learn more about plans
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
