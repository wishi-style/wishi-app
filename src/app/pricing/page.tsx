import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getPlanPricesForUi } from "@/lib/plans";
import { planTierOrder, type PlanTier } from "@/lib/ui/plan-copy";
import { SiteHeader } from "@/components/primitives/site-header";
import { SiteFooter } from "@/components/primitives/site-footer";
import { Reveal } from "@/components/primitives/reveal";
import { ReviewsCarousel } from "@/components/marketing/reviews-carousel";
import { FeatureAccordion, type PricingFeature } from "./feature-accordion";
import { ComparePlansDialog } from "./compare-plans-dialog";

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

// Loveable Pricing.tsx accents — Major is `bg-[hsl(0,65%,45%)]` (deeper red,
// not the burgundy token), Lux is `bg-[hsl(45,60%,45%)]`.
const tierAccent: Record<PlanTier, string> = {
  MINI: "bg-foreground",
  MAJOR: "bg-[hsl(0,65%,45%)]",
  LUX: "bg-[hsl(45,60%,45%)]",
};

const tierName: Record<PlanTier, string> = {
  MINI: "Wishi Mini",
  MAJOR: "Wishi Major",
  LUX: "Wishi Lux",
};

// Detailed per-feature copy for the per-tier expandable accordions on
// /pricing. The shorter `bullets[]` in lib/ui/plan-copy.ts powers landing
// teasers and upgrade dialogs; this file is the long-form pricing-page
// version.
//
// Lux deliberately omits three features that Loveable's source still has —
// "2 seasonal capsules", "free and priority shipping", "virtual fitting
// room" — per founder decision 2026-04-07.
const tierFeatures: Record<PlanTier, PricingFeature[]> = {
  MINI: [
    {
      title: "1:1 chat with your stylist",
      description:
        "Direct access to a pro stylist trained by Karla Welch. Share what you need, what you like, and what you already own.",
    },
    {
      title: "A Mood Board to define your style direction",
      description:
        "Your stylist starts with a custom Mood Board to align on taste — the quickest way to make sure you're getting exactly the vibe you want. Adjust the direction early if it doesn't feel right.",
    },
    {
      title: "2 Style Boards with curated products and shopping links",
      description:
        "Once the direction is approved, you get two shoppable Style Boards. Each blends new pieces with items from your closet — every product handpicked for your body, budget, and lifestyle.",
    },
    {
      title: "Revisions to get it just right",
      description:
        "If something isn't quite you, request revisions. Your stylist will refine each board (one revision per board) until it matches what you want with full precision.",
    },
    {
      title: "Access to brands worldwide",
      description:
        "Stylists aren't limited by a store list and aren't paid on commission — they pull from any brand available online so recommendations are based only on taste, fit, and what works best for you.",
    },
  ],
  MAJOR: [
    {
      title: "1:1 chat with your stylist",
      description:
        "Direct access to a pro stylist trained by Karla Welch. Share what you need, what you like, and what you already own.",
    },
    {
      title: "A Mood Board to define your style direction",
      description:
        "Your stylist starts with a custom Mood Board to align on taste — the quickest way to make sure you're getting exactly the vibe you want.",
    },
    {
      title: "5 Style Boards with curated products and shopping links",
      description:
        "Five shoppable Style Boards built around the approved direction. Each blends new pieces with items from your closet — every product handpicked for your body, budget, and lifestyle.",
    },
    {
      title: "Revisions to get it just right",
      description:
        "Your stylist refines each board (one revision per board) until it matches what you want with full precision.",
    },
    {
      title: "Access to brands worldwide",
      description:
        "Stylists pull from any brand available online — recommendations are based only on taste, fit, and what works best for you.",
    },
    {
      title: "Closet styling and outfit building",
      description:
        "Your stylist helps you get the most out of what you already own. Add photos of your wardrobe and they'll incorporate those pieces into new outfits, solve styling challenges, and unlock a closet you love.",
    },
    {
      title: "Personal style and beauty advice",
      description:
        "Ask about anything — fit and proportions, dressing for a work trip, makeup tones, accessories, or any detail that completes your look.",
    },
  ],
  LUX: [
    {
      title: "A 30-minute intro call so your stylist learns your style and goals",
      description:
        "You and your stylist connect live to review your lifestyle, goals, schedule, and personal preferences — so they can style you with intention from day one.",
    },
    {
      title: "A Mood Board to define your style direction",
      description:
        "A custom Mood Board to align on taste before any styling begins. Adjust the direction early if it doesn't feel right.",
    },
    {
      title: "Up to 8 curated Style Boards",
      description:
        "Eight Style Boards filled with complete outfits, new ideas, and handpicked items for your needs. Each board can incorporate new pieces, things you already own, or a mix of both.",
    },
    {
      title: "Revisions to get it just right",
      description: "You can revise each board until your looks feel perfect.",
    },
    {
      title: "Unlimited messaging",
      description:
        "Send photos, ask for style advice, share dressing-room pics, get ongoing guidance — like having your own stylist on text whenever you need support.",
    },
    {
      title: "Priority shipping on Wishi orders",
      description:
        "Items you buy through Wishi ship priority so your must-have pieces arrive sooner.",
    },
    {
      title: "Closet styling and outfit building",
      description:
        "Your stylist helps you get the most out of what you already own. Add photos of your wardrobe and they'll incorporate those pieces into new outfits, solve styling challenges, and unlock a closet you love.",
    },
    {
      title: "Personal style and beauty advice",
      description:
        "Ask about anything — fit and proportions, dressing for a work trip, makeup tones, accessories, or any detail that completes your look.",
    },
  ],
};

const howItWorksSteps = [
  { num: "1", title: "Get matched with top stylists", image: "/img/hiw-step1-match.png" },
  { num: "2", title: "Book an online session", image: "/img/hiw-step2-plan.png" },
  { num: "3", title: "Receive personalized shoppable looks", image: "/img/hiw-step3-session.png" },
  { num: "4", title: "Buy what you love", image: "/img/hiw-step4-shop.png" },
] as const;

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
      <div className="min-h-screen bg-background">
        {/* Hero — Loveable Pricing.tsx:178-240 */}
        <section className="container max-w-5xl py-16 md:py-24">
          <Reveal>
            <div className="text-center mb-14">
              <h1 className="font-display text-4xl md:text-5xl mb-3">
                Find Your Perfect Plan
              </h1>
              <p className="font-body text-base text-muted-foreground mb-4">
                100% satisfaction guaranteed.
              </p>
              <ComparePlansDialog />
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {planTierOrder.map((tier) => {
              const price = priceFor[tier];
              const features = tierFeatures[tier];
              const isPopular = tier === "MAJOR";
              return (
                <Reveal key={tier}>
                  <div className="rounded-xl border-2 border-border bg-card flex flex-col h-full hover:border-foreground/30 hover:shadow-md transition-all duration-200 overflow-hidden relative">
                    <div className={`h-1.5 ${tierAccent[tier]}`} />
                    {isPopular && (
                      <div className="absolute top-4 right-4">
                        <span className="font-body text-[10px] uppercase tracking-widest bg-foreground text-background px-2.5 py-1 rounded-full">
                          Popular
                        </span>
                      </div>
                    )}
                    <div className="p-7 flex flex-col h-full">
                      <p className="font-body text-[10px] text-muted-foreground uppercase tracking-widest mb-4">
                        {tierLabels[tier]}
                      </p>
                      <h2 className="font-display text-2xl mb-1">
                        {tierName[tier]}
                      </h2>
                      <p className="font-display text-3xl mb-6">{`$${price}`}</p>

                      <Link
                        href="/match-quiz"
                        className="inline-flex items-center justify-center rounded-[4px] bg-foreground text-background px-6 py-3 text-sm font-body font-medium hover:bg-foreground/90 transition-colors w-full mb-8"
                      >
                        Let&apos;s Get Styling
                      </Link>

                      <ul className="flex-1">
                        {features.map((feature) => (
                          <FeatureAccordion key={feature.title} feature={feature} />
                        ))}
                      </ul>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </section>

        {/* Concierge banner — Loveable Pricing.tsx:244-269 */}
        <section className="bg-[hsl(30,30%,93%)]">
          <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-0">
            <div className="relative h-[400px] md:h-[520px] overflow-hidden">
              <Image
                src="/img/wishi-concierge.png"
                alt="Wishi Concierge on a phone screen"
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                className="object-cover object-center"
              />
            </div>
            <div className="text-center px-8 py-16 md:py-0">
              <h2 className="font-display text-3xl md:text-4xl mb-4">Chat with us.</h2>
              <p className="font-body text-sm text-foreground max-w-sm mx-auto mb-8 leading-relaxed">
                Schedule a complimentary consultation with Wishi Concierge to discuss your style
                goals and find a plan tailored to you.
              </p>
              <a
                href="https://calendly.com/ninane-wishi/wishi-consultation?month=2026-04"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center border border-foreground rounded-[4px] px-8 py-3 font-body text-sm hover:bg-foreground hover:text-background transition-colors"
              >
                Schedule consultation
              </a>
            </div>
          </div>
        </section>

        {/* How It Works — Loveable Pricing.tsx:272-310 */}
        <section>
          <div className="container max-w-5xl py-14 md:py-20">
            <Reveal>
              <h2 className="font-display text-3xl md:text-4xl text-center mb-12">
                How it Works
              </h2>
            </Reveal>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
              {howItWorksSteps.map((step) => (
                <Reveal key={step.num}>
                  <div className="text-center">
                    <p className="font-display text-3xl mb-2">{step.num}</p>
                    <p className="font-body text-sm text-foreground/80 mb-5 leading-snug min-h-[40px]">
                      {step.title}
                    </p>
                    <div className="rounded-xl overflow-hidden border border-border bg-background shadow-sm">
                      <Image
                        src={step.image}
                        alt={step.title}
                        width={300}
                        height={300}
                        className="w-full h-auto object-contain"
                        loading="lazy"
                      />
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
            <div className="text-center mt-10">
              <Link
                href="/how-it-works"
                className="inline-flex items-center justify-center rounded-[4px] border border-foreground text-foreground px-8 py-3 text-sm font-body font-medium hover:bg-foreground hover:text-background transition-colors"
              >
                Learn More
              </Link>
            </div>
          </div>
        </section>

        {/* Reviews Carousel — Loveable Pricing.tsx:313 */}
        <ReviewsCarousel />
      </div>
      <SiteFooter />
    </>
  );
}
