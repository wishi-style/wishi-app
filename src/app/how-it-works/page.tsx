import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, StarIcon } from "lucide-react";
import { SiteHeader } from "@/components/primitives/site-header";
import { SiteFooter } from "@/components/primitives/site-footer";
import { Reveal } from "@/components/primitives/reveal";
import { PillButton } from "@/components/primitives/pill-button";

export const metadata: Metadata = {
  title: "How it works — Wishi",
  description:
    "Five simple steps to a wardrobe you'll actually love — from quiz to stylist match to curated style boards.",
};

const steps = [
  { num: "01", title: "Tell us About You", desc: "Share your style, size, fit, wardrobe needs, budget, and lifestyle." },
  { num: "02", title: "Meet Your Stylist", desc: "Get matched with a stylist who understands your style, directly." },
  { num: "03", title: "Get Your Style Boards", desc: "Your stylist creates curated shoppable outfit boards — just for you." },
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
  "TOTEME", "Sandro", "The Frankie Shop", "Isabel Marant", "Reformation",
  "ANINE BING", "Mango", "Good American", "LOEWE", "Vince",
  "Bottega Veneta", "Jacquemus", "AGOLDE", "The Row", "Khaite", "STAUD",
] as const;

const occasions = [
  { label: "Work", image: "/img/hiw-work.png" },
  { label: "School Drop-Off", image: "/img/hiw-school.png" },
  { label: "Vacation", image: "/img/hiw-vacation.png" },
  { label: "Event", image: "/img/hiw-event.png" },
] as const;

const reviews = [
  { text: "I got completely transformed! But I think about getting dressed. Every piece works together.", author: "Sarah M.", rating: 5 },
  { text: "I hate shopping but love looking good. Wishi solved that problem entirely.", author: "James B.", rating: 5 },
  { text: "She has that 'her too' vibe. I already sent it to my friends. It felt personal and powerful.", author: "Elena C.", rating: 5 },
] as const;

export default function HowItWorksPage() {
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background">
        <section className="bg-secondary/30 py-16 md:py-24">
          <div className="mx-auto max-w-5xl px-6 md:px-10">
            <Reveal>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground text-center mb-3">
                Your Style Journey
              </p>
              <h1 className="font-display text-4xl md:text-5xl text-center mb-4">
                How it Works
              </h1>
              <p className="text-sm text-muted-foreground text-center max-w-lg mx-auto mb-14">
                Five simple steps to a wardrobe you&apos;ll actually love.
              </p>
            </Reveal>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-8 md:gap-5 mb-12">
              {steps.map((step, i) => (
                <Reveal key={step.num} delay={i * 100}>
                  <div className="relative text-center">
                    <div className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center mx-auto mb-3 font-display text-sm">
                      {step.num}
                    </div>
                    {i < steps.length - 1 && (
                      <div className="hidden md:block absolute top-5 left-[60%] right-[-40%] border-t border-dashed border-foreground/20" />
                    )}
                    <h3 className="font-display text-sm md:text-base mb-1.5">
                      {step.title}
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {step.desc}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>

            <Reveal delay={500}>
              <div className="flex justify-center">
                <PillButton href="/match-quiz" variant="solid" size="lg" className="group">
                  Find Your Best Match
                  <ArrowRightIcon className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </PillButton>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="py-16 md:py-24">
          <div className="mx-auto max-w-5xl px-6 md:px-10">
            <Reveal>
              <h2 className="font-display text-2xl md:text-3xl text-center mb-3">
                What You Receive
              </h2>
              <p className="text-sm text-muted-foreground text-center max-w-md mx-auto mb-12">
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
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        sizes="(min-width: 768px) 33vw, 50vw"
                      />
                    </div>
                    <p className="font-display text-sm md:text-base">{f.title}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-secondary/20 py-16 md:py-24">
          <div className="mx-auto max-w-5xl px-6 md:px-10">
            <Reveal>
              <h2 className="font-display text-2xl md:text-3xl text-center mb-3">
                Build a Wardrobe That Works
              </h2>
              <p className="text-sm text-muted-foreground text-center max-w-xl mx-auto mb-12">
                Wishi isn&apos;t just about one outfit — it&apos;s about building a cohesive wardrobe over
                time that reflects who you are.
              </p>
            </Reveal>
            <Reveal>
              <div className="grid md:grid-cols-2 gap-10 items-center">
                <div className="relative aspect-[5/4] overflow-hidden rounded-2xl shadow-md">
                  <Image
                    src="/img/hiw-wardrobe.png"
                    alt="Use what you already own"
                    fill
                    className="object-cover"
                    sizes="(min-width: 768px) 50vw, 100vw"
                  />
                </div>
                <div>
                  <h3 className="font-display text-xl md:text-2xl mb-4">
                    Use What You Already Own
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                    Upload items from your existing wardrobe and your stylist will integrate them
                    into new outfits. No need to start from scratch — we work with what you have.
                  </p>
                  <Link
                    href="/match-quiz"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline underline-offset-4 hover:text-foreground/70 transition-colors"
                  >
                    Get started <ArrowRightIcon className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="py-16 md:py-24">
          <div className="mx-auto max-w-4xl px-6 md:px-10">
            <Reveal>
              <div className="grid md:grid-cols-2 gap-12 items-center">
                <div>
                  <h2 className="font-display text-2xl md:text-3xl mb-4">
                    Shop the Entire Fashion Market
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Our stylists recommend items from across all brands and retailers — from high-end
                    designers to accessible fashion. You&apos;re not tied to a single store.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  {brands.map((brand) => (
                    <span
                      key={brand}
                      className="text-xs font-medium text-foreground tracking-wide px-4 py-2 rounded-full border border-border bg-muted/50 hover:bg-secondary/40 transition-colors"
                    >
                      {brand}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="bg-foreground text-background py-16 md:py-24">
          <div className="mx-auto max-w-4xl px-6 md:px-10 text-center">
            <Reveal>
              <h2 className="font-display text-2xl md:text-3xl mb-14">Why Wishi Works</h2>
            </Reveal>
            <div className="grid grid-cols-3 gap-8 md:gap-12">
              {[
                { word: "Taste", desc: "Professional stylists with real fashion experience." },
                { word: "Trust", desc: "Stylists are not paid commissions by brands." },
                { word: "Time", desc: "Skip hours of searching. Get curated outfits." },
              ].map((item, i) => (
                <Reveal key={item.word} delay={i * 150}>
                  <div>
                    <div className="w-12 h-12 rounded-full border border-background/30 flex items-center justify-center mx-auto mb-4">
                      <span className="font-display text-lg">{item.word[0]}</span>
                    </div>
                    <h3 className="font-display text-xl md:text-2xl italic mb-3">{item.word}</h3>
                    <p className="text-xs md:text-sm text-background/70 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 md:py-24">
          <div className="mx-auto max-w-5xl px-6 md:px-10">
            <Reveal>
              <h2 className="font-display text-2xl md:text-3xl text-center mb-3">Get Styled For</h2>
              <p className="text-sm text-muted-foreground text-center max-w-md mx-auto mb-12">
                Whatever the occasion, your stylist has you covered.
              </p>
            </Reveal>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
              {occasions.map((occ, i) => (
                <Reveal key={occ.label} delay={i * 100}>
                  <div className="text-center group">
                    <div className="relative aspect-[3/4] overflow-hidden rounded-2xl mb-3 ring-1 ring-border/50 transition-shadow duration-300 group-hover:shadow-lg">
                      <Image
                        src={occ.image}
                        alt={occ.label}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        sizes="(min-width: 768px) 25vw, 50vw"
                      />
                    </div>
                    <p className="font-display text-base italic">{occ.label}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-secondary/20 py-16 md:py-24">
          <div className="mx-auto max-w-5xl px-6 md:px-10">
            <Reveal>
              <h2 className="font-display text-2xl md:text-3xl text-center mb-12">
                What Our Clients Say
              </h2>
            </Reveal>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {reviews.map((review, i) => (
                <Reveal key={review.author} delay={i * 100}>
                  <div className="rounded-2xl border border-border bg-background p-7 shadow-sm hover:shadow-md transition-shadow duration-300">
                    <div className="flex gap-0.5 mb-4">
                      {Array.from({ length: review.rating }).map((_, j) => (
                        <StarIcon
                          key={j}
                          className="h-4 w-4 fill-foreground text-foreground"
                        />
                      ))}
                    </div>
                    <p className="text-sm text-foreground leading-relaxed mb-5">
                      &ldquo;{review.text}&rdquo;
                    </p>
                    <p className="font-display text-xs text-muted-foreground tracking-wide">
                      — {review.author}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-foreground text-background py-20 md:py-28">
          <Reveal>
            <div className="mx-auto max-w-3xl px-6 md:px-10 text-center">
              <h2 className="font-display text-3xl md:text-5xl leading-tight mb-2">
                Ready for a wardrobe that
              </h2>
              <h2 className="font-display text-3xl md:text-5xl italic leading-tight mb-8">
                actually works?
              </h2>
              <p className="text-sm text-background/60 mb-10 max-w-md mx-auto">
                Join thousands of clients who&apos;ve transformed their style with Wishi.
              </p>
              <Link
                href="/match-quiz"
                className="group inline-flex items-center gap-2 rounded-full bg-background text-foreground px-10 py-3.5 text-sm font-medium hover:bg-background/90 transition-colors"
              >
                Let&apos;s Get Styling
                <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </Reveal>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
