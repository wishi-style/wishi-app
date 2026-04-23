import type { Metadata } from "next";
import Image from "next/image";
import { StarIcon } from "lucide-react";
import { getPlanPricesForUi } from "@/lib/plans";
import { planCopy, planTierOrder, type PlanTier } from "@/lib/ui/plan-copy";
import { SiteHeader } from "@/components/primitives/site-header";
import { SiteFooter } from "@/components/primitives/site-footer";
import { Reveal } from "@/components/primitives/reveal";
import { PillButton } from "@/components/primitives/pill-button";
import { FaqList } from "@/components/primitives/faq";

export const metadata: Metadata = {
  title: "Wishi — Personalized Luxury Styling",
  description:
    "Wishi connects you with style experts who curate personalized, shoppable looks — from your own closet and the best brands in the world.",
};

export const dynamic = "force-dynamic";

const stylists = [
  { name: "Mika", style: "Minimalist · Chic", portfolio: "/img/portfolio-mika.jpg" },
  { name: "Adriana", style: "Classic · Minimal", portfolio: "/img/portfolio-adriana.jpg" },
  { name: "Sophie", style: "Effortless · Cool", portfolio: "/img/portfolio-sophie.jpg" },
  { name: "Claire", style: "French · Elegant", portfolio: "/img/portfolio-claire.jpg" },
] as const;

const steps = [
  { num: "1", title: "Get matched with top stylists", image: "/img/hiw-step1-match.png" },
  { num: "2", title: "Book an online session", image: "/img/hiw-step2-plan.png" },
  { num: "3", title: "Receive personalized shoppable looks", image: "/img/hiw-step3-session.png" },
  { num: "4", title: "Buy what you love", image: "/img/hiw-step4-shop.png" },
] as const;

const tierLandingLabel: Record<PlanTier, string> = {
  MINI: "New pieces to my closet",
  MAJOR: "New looks for the season",
  LUX: "Take my wardrobe to the next level",
};

const reviews = [
  {
    text: "Wishi has completely changed how I shop online. My stylist knows exactly what works for me and my lifestyle.",
    author: "Vicki",
    role: "Hotelier",
  },
  {
    text: "My stylist introduced me to brands I never would have found on my own. It's like having a fashion-savvy best friend.",
    author: "Hanna",
    role: "Marketing Director",
  },
  {
    text: "I used Wishi for a special event and received so many compliments. I'll definitely be using it again.",
    author: "Sybella",
    role: "Creative Director",
  },
] as const;

const styledLooks = [
  "/img/styled-look-1.jpg",
  "/img/styled-look-2.jpg",
  "/img/styled-look-3.jpg",
  "/img/styled-look-4.jpg",
] as const;

const faqs = [
  {
    q: "How does this service work?",
    a: "Wishi matches you with a personal stylist who helps you reach your style goals no matter your budget, size, or occasion. Your session starts with an inspirational mood board, followed by shoppable style boards where you can buy what you love.",
  },
  {
    q: "What brands and budgets do you work with?",
    a: "Our stylists can curate pieces from any brand or retailer, at any price point, across the internet — from your favorite go-to labels to emerging designers you haven't discovered yet.",
  },
  {
    q: "Is Wishi a subscription service?",
    a: "Wishi is not a box subscription. We offer one-time or recurring monthly services where our stylists build looks for you to shop from.",
  },
  {
    q: "What if I don't like what my stylist suggests?",
    a: "You can always request a different stylist! Just let us know who you'd like to work with and we'll take care of the rest.",
  },
  {
    q: "Which styling plan should I choose?",
    a: "Start with the Major or Lux plan. Major includes 5 personalized style boards. Lux offers 8 curated style boards and a 30-minute video call for a fully personalized experience.",
  },
] as const;

const pressLogos = ["InStyle", "Vogue", "Forbes", "GQ", "Elle", "WWD", "The Cut", "Nylon"] as const;

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default async function HomePage() {
  const prices = await getPlanPricesForUi();
  const priceFor: Record<PlanTier, number> = {
    MINI: prices.mini.displayDollars,
    MAJOR: prices.major.displayDollars,
    LUX: prices.lux.displayDollars,
  };

  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      <SiteHeader />
      <main className="min-h-screen bg-background">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="mx-auto max-w-6xl px-6 md:px-10 py-20 md:py-28">
            <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
              <div className="flex-1 text-center lg:text-left">
                <h1 className="font-display text-5xl md:text-6xl lg:text-7xl leading-[1.05] tracking-tight mb-6">
                  #1 App for Personalized Luxury Styling
                </h1>
                <p className="text-lg text-muted-foreground max-w-md mx-auto lg:mx-0 mb-8 leading-relaxed">
                  Wishi connects you with style experts to help you shop online while
                  incorporating what you already own to build your perfect wardrobe.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                  <PillButton href="/match-quiz" variant="solid" size="lg">
                    Let&apos;s Get Styling
                  </PillButton>
                  <PillButton href="/how-it-works" variant="outline" size="lg">
                    How It Works
                  </PillButton>
                </div>
              </div>

              <div className="flex-1 w-full max-w-lg">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-3">
                    <Image
                      src="/img/hiw-styleboards.png"
                      alt="Style board preview"
                      width={400}
                      height={520}
                      className="w-full rounded-xl shadow-md"
                      sizes="(min-width: 1024px) 25vw, 50vw"
                    />
                    <Image
                      src="/img/hiw-chat.png"
                      alt="Stylist chat preview"
                      width={400}
                      height={520}
                      className="w-full rounded-xl shadow-md"
                      sizes="(min-width: 1024px) 25vw, 50vw"
                    />
                  </div>
                  <div className="space-y-3 pt-8">
                    <Image
                      src="/img/hiw-moodboard.png"
                      alt="Mood board preview"
                      width={400}
                      height={520}
                      className="w-full rounded-xl shadow-md"
                      sizes="(min-width: 1024px) 25vw, 50vw"
                    />
                    <Image
                      src="/img/hiw-purchaselinks.png"
                      alt="Shop the board preview"
                      width={400}
                      height={520}
                      className="w-full rounded-xl shadow-md"
                      sizes="(min-width: 1024px) 25vw, 50vw"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Press Logos */}
        <section className="border-y border-border bg-muted/30 py-8">
          <div className="mx-auto max-w-6xl px-6 md:px-10">
            <p className="text-center font-display text-lg italic text-muted-foreground mb-6">
              &ldquo;Best Personalized Styling App&rdquo;
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
              {pressLogos.map((name) => (
                <span
                  key={name}
                  className="font-display text-base text-muted-foreground/70 tracking-wide"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Stylists */}
        <section className="py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-6 md:px-10">
            <Reveal>
              <div className="text-center mb-12">
                <h2 className="font-display text-3xl md:text-4xl mb-3">
                  Meet Our Wishi Stylists
                </h2>
                <p className="text-base text-muted-foreground max-w-lg mx-auto">
                  Take our quiz to get matched with one of our expert stylists. From petite to
                  plus size, our diverse team is here to style you for every occasion.
                </p>
              </div>
            </Reveal>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {stylists.map((s, i) => (
                <Reveal key={s.name} delay={i * 80}>
                  <div className="group text-center">
                    <div className="relative aspect-[3/4] overflow-hidden rounded-xl mb-4">
                      <Image
                        src={s.portfolio}
                        alt={s.name}
                        fill
                        sizes="(min-width: 768px) 25vw, 50vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                    <h3 className="font-display text-xl">{s.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{s.style}</p>
                  </div>
                </Reveal>
              ))}
            </div>

            <div className="text-center mt-10">
              <PillButton href="/match-quiz" variant="solid" size="lg">
                Find Your Best Match
              </PillButton>
            </div>
          </div>
        </section>

        {/* How it Works */}
        <section className="bg-muted/30 border-y border-border">
          <div className="mx-auto max-w-5xl px-6 md:px-10 py-16 md:py-24">
            <Reveal>
              <h2 className="font-display text-3xl md:text-4xl text-center mb-14">
                How It Works
              </h2>
            </Reveal>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {steps.map((step, i) => (
                <Reveal key={step.num} delay={i * 80}>
                  <div className="text-center">
                    <div className="inline-flex items-center justify-center h-10 w-10 rounded-full border-2 border-foreground font-display text-lg mb-4">
                      {step.num}
                    </div>
                    <p className="text-sm font-medium text-foreground mb-4">
                      {step.title}
                    </p>
                    <div className="relative aspect-[9/16] overflow-hidden rounded-2xl bg-muted shadow-md">
                      <Image
                        src={step.image}
                        alt={step.title}
                        fill
                        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                        className="object-cover object-top"
                      />
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>

            <div className="text-center mt-10">
              <PillButton href="/how-it-works" variant="outline" size="md">
                Learn More
              </PillButton>
            </div>
          </div>
        </section>

        {/* Pricing teaser */}
        <section className="py-16 md:py-24">
          <div className="mx-auto max-w-5xl px-6 md:px-10">
            <Reveal>
              <h2 className="font-display text-3xl md:text-4xl text-center mb-4">
                A Perfect Fit For Everyone
              </h2>
            </Reveal>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
              {planTierOrder.map((tier, i) => {
                const copy = planCopy[tier];
                return (
                  <Reveal key={tier} delay={i * 80}>
                    <div className="rounded-xl border border-border bg-card p-8 flex flex-col h-full hover:shadow-md transition-shadow">
                      <p className="text-xs text-foreground uppercase tracking-wider mb-3 font-medium">
                        {tierLandingLabel[tier]}
                      </p>
                      <h3 className="font-display text-2xl mb-1">Wishi {copy.name}</h3>
                      <p className="font-display text-3xl mb-6">${priceFor[tier]}</p>
                      <ul className="space-y-3 flex-1">
                        {copy.bulletsShort.map((f) => (
                          <li
                            key={f}
                            className="text-sm text-foreground flex items-start gap-2"
                          >
                            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-foreground shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                      <PillButton
                        href="/pricing"
                        variant="outline"
                        size="md"
                        className="mt-8 w-full"
                      >
                        Learn More
                      </PillButton>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* #StyledByWishi */}
        <section className="bg-muted/30 border-y border-border">
          <div className="mx-auto max-w-6xl px-6 md:px-10 py-16 md:py-24">
            <Reveal>
              <div className="text-center mb-12">
                <h2 className="font-display text-3xl md:text-4xl mb-3">
                  #StyledByWishi
                </h2>
                <p className="text-base text-muted-foreground max-w-lg mx-auto">
                  Our stylists have access to every brand in the world, from designer to high
                  street. Best of all, they can style you from your own closet!
                </p>
              </div>
            </Reveal>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {styledLooks.map((src, i) => (
                <Reveal key={src} delay={i * 60}>
                  <div className="relative aspect-square overflow-hidden rounded-xl">
                    <Image
                      src={src}
                      alt={`Styled look ${i + 1}`}
                      fill
                      sizes="(min-width: 768px) 25vw, 50vw"
                      className="object-cover hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Reviews */}
        <section className="py-16 md:py-24">
          <div className="mx-auto max-w-5xl px-6 md:px-10">
            <Reveal>
              <h2 className="font-display text-3xl md:text-4xl text-center mb-12">
                Our Clients Tell It How It Is
              </h2>
            </Reveal>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {reviews.map((r, i) => (
                <Reveal key={r.author} delay={i * 100}>
                  <div className="flex flex-col h-full">
                    <div className="flex gap-1 mb-4">
                      {Array.from({ length: 5 }).map((_, idx) => (
                        <StarIcon
                          key={idx}
                          className="h-4 w-4 fill-foreground text-foreground"
                        />
                      ))}
                    </div>
                    <p className="text-base text-foreground leading-relaxed flex-1 italic">
                      &ldquo;{r.text}&rdquo;
                    </p>
                    <div className="mt-4 pt-4 border-t border-border">
                      <p className="font-display text-base">{r.author}</p>
                      <p className="text-xs text-muted-foreground">{r.role}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="bg-muted/30 border-y border-border">
          <div className="mx-auto max-w-3xl px-6 md:px-10 py-16 md:py-24">
            <Reveal>
              <h2 className="font-display text-3xl md:text-4xl text-center mb-12">
                Your Questions, Answered
              </h2>
            </Reveal>
            <FaqList items={faqs} />
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-20 md:py-28">
          <div className="mx-auto max-w-3xl px-6 md:px-10 text-center">
            <Reveal>
              <h2 className="font-display text-3xl md:text-5xl mb-4">
                Ready to Transform Your Wardrobe?
              </h2>
              <p className="text-base text-muted-foreground max-w-md mx-auto mb-8">
                Take a quick style quiz and get matched with a stylist who truly gets your vibe.
              </p>
              <PillButton href="/match-quiz" variant="solid" size="lg">
                Let&apos;s Get Styling
              </PillButton>
            </Reveal>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
