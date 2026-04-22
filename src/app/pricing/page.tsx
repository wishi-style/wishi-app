import type { Metadata } from "next";
import { PlusIcon } from "lucide-react";
import { getPlanPricesForUi } from "@/lib/plans";
import { planCopy, planTierOrder, type PlanTier } from "@/lib/ui/plan-copy";
import { SiteHeader } from "@/components/primitives/site-header";
import { SiteFooter } from "@/components/primitives/site-footer";
import { Section } from "@/components/primitives/section";
import { PillButton } from "@/components/primitives/pill-button";
import { Reveal } from "@/components/primitives/reveal";

export const metadata: Metadata = {
  title: "Pricing — Wishi",
  description:
    "Three ways to work with a Wishi stylist — Mini, Major, and Lux. 100% satisfaction guaranteed.",
};

export const dynamic = "force-dynamic";

const tierLabels: Record<PlanTier, string> = {
  MINI: "NEW PIECES TO MY CLOSET",
  MAJOR: "NEW LOOKS FOR THE SEASON",
  LUX: "TAKE MY WARDROBE TO THE NEXT LEVEL",
};

const tierAccent: Record<PlanTier, string> = {
  MINI: "bg-foreground",
  MAJOR: "bg-burgundy",
  LUX: "bg-[hsl(45,60%,45%)]",
};

export default async function PricingPage() {
  const prices = await getPlanPricesForUi();
  const priceFor: Record<PlanTier, number> = {
    MINI: prices.mini.displayDollars,
    MAJOR: prices.major.displayDollars,
    LUX: prices.lux.displayDollars,
  };

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background">
        <Section tone="plain" className="!py-16 md:!py-24">
          <Reveal>
            <div className="text-center mb-14">
              <h1 className="font-display text-4xl md:text-5xl mb-3">
                Find Your Perfect Plan
              </h1>
              <p className="text-base text-muted-foreground">
                100% satisfaction guaranteed.
              </p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {planTierOrder.map((tier, idx) => {
              const copy = planCopy[tier];
              const price = priceFor[tier];
              return (
                <Reveal key={tier} delay={idx * 80}>
                  <article className="rounded-xl border border-border bg-card flex flex-col h-full shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                    <div className={`h-1.5 ${tierAccent[tier]}`} />
                    <div className="p-8 flex flex-col h-full">
                      <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4 text-center">
                        {tierLabels[tier]}
                      </p>
                      <h2 className="font-display text-2xl text-center mb-1">
                        Wishi {copy.name}
                      </h2>
                      <p className="font-display text-3xl text-center mb-6">
                        ${price}
                      </p>
                      <PillButton
                        href="/match-quiz"
                        variant="solid"
                        size="md"
                        className="w-full mb-8"
                      >
                        {copy.ctaLabel}
                      </PillButton>
                      <ul className="space-y-4 flex-1">
                        {copy.bullets.map((bullet) => (
                          <li
                            key={bullet}
                            className="text-sm text-foreground flex items-start gap-3"
                          >
                            <PlusIcon className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </article>
                </Reveal>
              );
            })}
          </div>

          <p className="text-center text-sm text-muted-foreground mt-10">
            Need an extra look? Add one to any plan for $
            {prices.additionalLookDollars}.
          </p>
        </Section>
      </main>
      <SiteFooter />
    </>
  );
}
