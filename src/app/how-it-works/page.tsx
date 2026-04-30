import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { ArrowRightIcon } from "lucide-react";
import { SiteHeader } from "@/components/primitives/site-header";
import { SiteFooter } from "@/components/primitives/site-footer";
import { Reveal } from "@/components/primitives/reveal";

export const metadata: Metadata = {
  title: "How it works — Wishi",
  description:
    "Five simple steps to a wardrobe you'll actually love — from quiz to stylist match to curated style boards.",
};

const steps = [
  { num: "01", title: "Tell us About You", desc: "Short style quiz to understand your taste, needs, lifestyle, and goals." },
  { num: "02", title: "Meet Your Stylist", desc: "Get matched with a professional stylist and chat directly." },
  { num: "03", title: "Get Your Style Boards", desc: "Your stylist creates curated outfits with shoppable items." },
  { num: "04", title: "Collaborate & Refine", desc: "Give feedback and your stylist updates the looks." },
  { num: "05", title: "Shop What You Love", desc: "Buy only what you want — directly from retailers." },
] as const;

const features = [
  { title: "Personalized Moodboard", image: "/img/hiw-moodboard.png" },
  { title: "Shoppable Outfit Boards", image: "/img/hiw-styleboards.png" },
  { title: "Direct Stylist Chat", image: "/img/hiw-chat.png" },
  { title: "Purchase Links", image: "/img/hiw-purchaselinks.png" },
  { title: "Wardrobe Guidance", image: "/img/hiw-wardrobe.png" },
  { title: "A Call with the Lux Package", image: "/img/hiw-lux.png" },
] as const;

const brands = [
  "TOTEME", "Phoebe Philo", "The Frankie Shop", "Isabel Marant", "Reformation",
  "Zara", "Mango", "Good American", "LOEWE", "Vince",
  "Bottega Veneta", "Jacquemus", "AGOLDE", "The Row", "Khaite", "Róhe",
] as const;

const occasions = [
  { label: "Work", image: "/img/hiw-work.png" },
  { label: "School Drop-Off", image: "/img/hiw-school.png" },
  { label: "Vacation", image: "/img/hiw-vacation.png" },
  { label: "Event", image: "/img/hiw-event.png" },
] as const;

export default async function HowItWorksPage() {
  const { userId } = await auth();
  const signedIn = userId !== null && userId !== undefined;
  // Logged-in users have already onboarded — send them straight to the
  // stylist roster. New visitors land in the /match-quiz funnel.
  const ctaHref = signedIn ? "/stylists" : "/match-quiz";

  return (
    <>
      <SiteHeader />
      <div className="min-h-screen bg-background">
        {/* Hero — Loveable HowItWorks.tsx:62-123 */}
        <section className="bg-secondary/30 py-16 md:py-24">
          <div className="container max-w-6xl">
            <Reveal>
              <h1 className="font-display text-4xl md:text-5xl text-center mb-12 md:mb-16">
                How it Works
              </h1>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
              <div className="space-y-8">
                {steps.map((step, i) => (
                  <Reveal key={step.num} delay={i * 80}>
                    <div className="flex gap-4">
                      <span className="font-display text-3xl text-foreground/25 shrink-0 w-10">
                        {step.num}
                      </span>
                      <div>
                        <h3 className="font-display text-lg mb-1">
                          {step.title}
                        </h3>
                        <p className="font-body text-sm text-muted-foreground leading-relaxed">
                          {step.desc}
                        </p>
                      </div>
                    </div>
                  </Reveal>
                ))}

                <Reveal delay={500}>
                  <div className="pl-14">
                    <Link
                      href={ctaHref}
                      className="group inline-flex items-center gap-2 rounded-full bg-foreground text-background px-8 py-3 text-sm font-body font-medium hover:bg-foreground/90 transition-colors"
                    >
                      Find Your Best Match
                      <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </div>
                </Reveal>
              </div>

              <Reveal delay={200}>
                <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-muted border border-border shadow-sm">
                  <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <iframe
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                      style={{ width: "120%", height: "120%" }}
                      src="https://www.youtube.com/embed/92ErFLJyJCk?autoplay=1&mute=1&loop=1&playlist=92ErFLJyJCk&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&disablekb=1&fs=0"
                      title="How Wishi Works"
                      allow="autoplay; encrypted-media"
                      frameBorder="0"
                    />
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* What You Receive — Loveable HowItWorks.tsx:126-155 */}
        <section className="container max-w-5xl py-16 md:py-24">
          <Reveal>
            <h2 className="font-display text-2xl md:text-3xl text-center mb-3">
              What You Receive
            </h2>
            <p className="font-body text-sm text-muted-foreground text-center max-w-md mx-auto mb-12">
              Everything you need for a complete style transformation.
            </p>
          </Reveal>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 md:gap-8">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={i * 80}>
                <div className="text-center group">
                  <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted mb-4 ring-1 ring-border/50 transition-shadow duration-300 group-hover:shadow-lg">
                    <Image
                      src={f.image}
                      alt={f.title}
                      fill
                      sizes="(min-width: 768px) 33vw, 50vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                  <p className="font-display text-sm md:text-base">{f.title}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Build a Wardrobe That Works — Loveable HowItWorks.tsx:158-200 */}
        <section className="bg-secondary/20 py-16 md:py-24">
          <div className="container max-w-5xl">
            <Reveal>
              <h2 className="font-display text-2xl md:text-3xl text-center mb-3">
                Build a Wardrobe That Works
              </h2>
              <p className="font-body text-sm text-muted-foreground text-center max-w-xl mx-auto mb-12">
                Wishi isn&apos;t just about one outfit — it&apos;s about building a cohesive wardrobe over
                time that reflects who you are.
              </p>
            </Reveal>

            <Reveal>
              <div className="grid md:grid-cols-2 gap-10 items-center">
                <div className="overflow-hidden rounded-2xl shadow-md">
                  <Image
                    src="/img/hiw-closet.png"
                    alt="Use what you already own"
                    width={800}
                    height={512}
                    className="w-full h-auto object-cover"
                    loading="lazy"
                  />
                </div>
                <div>
                  <h3 className="font-display text-xl md:text-2xl mb-4">
                    Use What You Already Own
                  </h3>
                  <p className="font-body text-sm text-muted-foreground leading-relaxed mb-6">
                    Upload items from your existing wardrobe and your stylist will integrate them
                    into new outfits. No need to start from scratch — we work with what you have.
                  </p>
                  <Link
                    href="/stylists"
                    className="inline-flex items-center gap-1.5 font-body text-sm font-medium text-foreground underline underline-offset-4 hover:text-foreground/70 transition-colors"
                  >
                    Get started <ArrowRightIcon className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Shop the Entire Fashion Market — Loveable HowItWorks.tsx:203-229 */}
        <section className="py-16 md:py-24">
          <div className="container max-w-4xl">
            <Reveal>
              <div className="grid md:grid-cols-2 gap-12 items-center">
                <div>
                  <h2 className="font-display text-2xl md:text-3xl mb-4">
                    Shop the Entire Fashion Market
                  </h2>
                  <p className="font-body text-sm text-muted-foreground leading-relaxed">
                    Our stylists recommend items from across all brands and retailers — from high-end
                    designers to accessible fashion. You&apos;re not tied to a single store.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  {brands.map((brand) => (
                    <span
                      key={brand}
                      className="font-body text-xs font-medium text-foreground tracking-wide px-4 py-2 rounded-full border border-border bg-muted/50 hover:bg-secondary/40 transition-colors cursor-default"
                    >
                      {brand}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Why Wishi Works — Loveable HowItWorks.tsx:232-258. Italic words in a
            warm-beige tint, no circular badges. */}
        <section className="bg-foreground text-background py-16 md:py-24">
          <div className="container max-w-4xl text-center">
            <Reveal>
              <h2 className="font-display text-3xl md:text-4xl mb-16">
                Why Wishi Works
              </h2>
            </Reveal>
            <div className="grid grid-cols-3 gap-8 md:gap-12">
              {[
                { word: "Taste", desc: "Professional stylists with real fashion experience." },
                { word: "Trust", desc: "Stylists are not paid commissions by brands." },
                { word: "Time", desc: "Skip hours of searching. Get curated outfits." },
              ].map((item, i) => (
                <Reveal key={item.word} delay={i * 150}>
                  <div>
                    <h3
                      className="font-display text-3xl md:text-4xl italic mb-4"
                      style={{ color: "hsl(33, 45%, 72%)" }}
                    >
                      {item.word}
                    </h3>
                    <p className="font-body text-xs md:text-sm text-background/70 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Get Styled For — Loveable HowItWorks.tsx:261-300. 2-col grid, caption
            ABOVE each image, square aspect, "View more looks" CTA at the
            bottom. */}
        <section className="container max-w-5xl py-16 md:py-24">
          <Reveal>
            <h2 className="font-display text-2xl md:text-3xl text-center mb-3">
              Get Styled For
            </h2>
            <p className="font-body text-sm text-muted-foreground text-center max-w-md mx-auto mb-12">
              Whatever the occasion, your stylist has you covered.
            </p>
          </Reveal>
          <div className="grid grid-cols-2 gap-10 max-w-3xl mx-auto">
            {occasions.map((occ, i) => (
              <Reveal key={occ.label} delay={i * 100}>
                <div className="text-center group cursor-pointer">
                  <p className="font-display text-xl md:text-2xl italic tracking-wide mb-3">
                    {occ.label}
                  </p>
                  <div className="relative aspect-square overflow-hidden ring-1 ring-border/50 transition-shadow duration-300 group-hover:shadow-lg">
                    <Image
                      src={occ.image}
                      alt={occ.label}
                      fill
                      sizes="(min-width: 768px) 50vw, 50vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={400}>
            <div className="text-center mt-12">
              <Link
                href="/feed"
                className="inline-flex items-center justify-center rounded-[4px] border border-foreground text-foreground px-8 py-3 text-sm font-body font-medium hover:bg-foreground hover:text-background transition-colors"
              >
                View more looks
              </Link>
            </div>
          </Reveal>
        </section>

        {/* CTA Closer — Loveable HowItWorks.tsx:303-324 */}
        <section className="bg-foreground text-background py-20 md:py-28">
          <Reveal>
            <div className="container max-w-3xl text-center">
              <h2 className="font-display text-3xl md:text-5xl leading-tight mb-2">
                Ready for a wardrobe that
              </h2>
              <h2 className="font-display text-3xl md:text-5xl italic leading-tight mb-8">
                actually works?
              </h2>
              <p className="font-body text-sm text-background/60 mb-10 max-w-md mx-auto">
                Join thousands of clients who&apos;ve transformed their style with Wishi.
              </p>
              <Link
                href={ctaHref}
                className="group inline-flex items-center gap-2 rounded-full bg-background text-foreground px-10 py-3.5 text-sm font-body font-medium hover:bg-background/90 transition-colors"
              >
                Let&apos;s Get Styling
                <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </Reveal>
        </section>
      </div>
      <SiteFooter />
    </>
  );
}
