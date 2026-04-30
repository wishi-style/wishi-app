import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { StarIcon } from "lucide-react";
import { getPlanPricesForUi } from "@/lib/plans";
import { planTierOrder, type PlanTier } from "@/lib/ui/plan-copy";
import { SiteHeader } from "@/components/primitives/site-header";
import { SiteFooter } from "@/components/primitives/site-footer";
import { Reveal } from "@/components/primitives/reveal";
import { FaqList } from "@/components/primitives/faq";
import { StyledLooksCarousel } from "@/components/marketing/styled-looks-carousel";

export const metadata: Metadata = {
  title: "Wishi — Personalized Luxury Styling",
  description:
    "Wishi connects you with style experts who curate personalized, shoppable looks — from your own closet and the best brands in the world.",
};

export const dynamic = "force-dynamic";

const featured = {
  id: "karla",
  name: "Karla Welch",
  subtitle: "Wishi Co-founder\nCelebrity Stylist",
  image: "/img/stylist-karla.png",
};

const gridStylists = [
  { id: "zuajeiliy", name: "Zuajeiliy", tags: ["Elegant", "Minimal"], image: "/img/stylist-zuajeiliy.png" },
  { id: "connor", name: "Connor", tags: ["Edgy", "Streetwear"], image: "/img/stylist-connor.png" },
  { id: "alia", name: "Alia", tags: ["Classic", "Boho"], image: "/img/stylist-alia.png" },
  { id: "meredith", name: "Meredith", tags: ["Edgy", "Sexy"], image: "/img/stylist-meredith.png" },
  { id: "adriana", name: "Adriana", tags: ["Classic", "Minimal"], image: "/img/stylist-adriana-new.png" },
  { id: "daphne", name: "Daphne", tags: ["Chic", "Minimal"], image: "/img/stylist-daphne.png" },
] as const;

const steps = [
  { num: "1", title: "Get matched with top stylists", image: "/img/hiw-step1-match.png" },
  { num: "2", title: "Book an online session", image: "/img/hiw-step2-plan.png" },
  { num: "3", title: "Receive personalized shoppable looks", image: "/img/hiw-step3-session.png" },
  { num: "4", title: "Buy what you love", image: "/img/hiw-step4-shop.png" },
] as const;

const tierLandingLabel: Record<PlanTier, string> = {
  MINI: "New pieces to my closet",
  MAJOR: "New Looks for the season",
  LUX: "Take my wardrobe to the next level",
};

const tierAccent: Record<PlanTier, string> = {
  MINI: "bg-foreground",
  MAJOR: "bg-[hsl(0,40%,30%)]",
  LUX: "bg-[hsl(45,50%,60%)]",
};

const tierName: Record<PlanTier, string> = {
  MINI: "Wishi Mini",
  MAJOR: "Wishi Major",
  LUX: "Wishi Lux",
};

const tierShortFeatures: Record<PlanTier, readonly string[]> = {
  MINI: ["1:1 chat with your stylist", "2 Style boards", "2 Revisions"],
  MAJOR: ["1:1 chat with your stylist", "5 Style boards", "5 Revisions"],
  LUX: [],
};

const tierLuxDescription =
  "A highly personalized session with a dedicated stylist to take your wardrobe to the next level.";

const styledLooks = [
  "/img/styled-look-1.png",
  "/img/styled-look-2.png",
  "/img/styled-look-3.png",
  "/img/styled-look-4.jpg",
] as const;

// One review in Loveable's source uses a word that is on the founder's
// blocked-copy list (decision 2026-04-07); the Megan testimonial below
// intentionally rephrases that original to stay compliant.
type Review = {
  text: string;
  author: string;
  stylist: string;
  photo?: string;
};

const reviews: readonly Review[] = [
  {
    text: "Wishi has completely changed how I shop online. My stylist knows exactly what works for me and my lifestyle.",
    author: "Vicki",
    stylist: "Daphne V.",
    photo: "/img/review-vicki.jpg",
  },
  {
    text: "My stylist introduced me to brands I never would have found on my own. It's like having a fashion-savvy best friend.",
    author: "Hanna",
    stylist: "Mika R.",
    photo: "/img/review-hanna.jpg",
  },
  {
    text: "I used Wishi for a special event and received so many compliments. I'll definitely be using it again.",
    author: "Sybella",
    stylist: "Adriana M.",
    photo: "/img/review-sybella.jpg",
  },
  {
    text: "I was skeptical at first, but after my first mood board I was hooked. My wardrobe has never looked this cohesive.",
    author: "James",
    stylist: "Connor B.",
    photo: "/img/review-james.jpg",
  },
  {
    text: "As a busy mom, I don't have time to shop. Wishi gave me a complete closet refresh that actually works for my life.",
    author: "Megan",
    stylist: "Daphne V.",
    photo: "/img/review-megan.jpg",
  },
  {
    text: "The mood board alone was worth it. It gave me so much clarity about the direction I wanted my style to go.",
    author: "Oliver",
    stylist: "Connor B.",
  },
];

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
    a: "Start with the Major or Lux plan. The Major includes 5 personalized style boards. The Lux offers 8 boards, 2 capsules, and a Zoom call for a truly personalized experience.",
  },
] as const;

const pressLogos = Array.from({ length: 9 }, (_, i) => `/img/press/logo-${i + 1}.png`);

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
  const [{ userId }, prices] = await Promise.all([auth(), getPlanPricesForUi()]);
  const isLoggedIn = userId !== null && userId !== undefined;
  const matchHref = isLoggedIn ? "/stylists" : "/match-quiz";
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
      <div className="min-h-screen bg-background">
        <SiteHeader />

        {/* ─── Hero ─── */}
        <section className="relative overflow-hidden">
          <div className="container max-w-6xl py-20 md:py-28">
            <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
              <div className="flex-1 text-center lg:text-left">
                <h1 className="font-display text-5xl md:text-6xl lg:text-7xl leading-[1.05] tracking-tight mb-6">
                  #1 App for Personalized Luxury Styling
                </h1>
                <p className="font-body text-lg text-muted-foreground max-w-md mx-auto lg:mx-0 mb-8 leading-relaxed">
                  Wishi connects you with style experts to help you shop online while incorporating what you already own to build your perfect wardrobe.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                  <Link
                    href="/match-quiz"
                    className="inline-flex items-center justify-center rounded-full bg-foreground text-background px-8 py-3.5 text-sm font-body font-medium hover:bg-foreground/90 transition-colors"
                  >
                    Let&apos;s Get Styling
                  </Link>
                  <Link
                    href="/how-it-works"
                    className="inline-flex items-center justify-center rounded-full border border-foreground text-foreground px-8 py-3.5 text-sm font-body font-medium hover:bg-foreground hover:text-background transition-colors"
                  >
                    How It Works
                  </Link>
                </div>
              </div>

              <div className="flex-1 w-full max-w-lg">
                <Image
                  src="/img/hero-collage.png"
                  alt="Personalized styling collage showing stylist and client interaction"
                  width={1200}
                  height={1200}
                  priority
                  className="w-full h-auto"
                  sizes="(min-width: 1024px) 40vw, 100vw"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ─── Press Logos ─── */}
        <section className="bg-foreground py-8 overflow-hidden">
          <p className="text-center font-display text-xl md:text-2xl italic text-background/70 mb-6">
            &ldquo;Best Personalized Styling App&rdquo;
          </p>
          <div className="relative">
            <div className="flex animate-marquee w-max items-center gap-12">
              {[...pressLogos, ...pressLogos].map((src, i) => (
                <Image
                  key={`${src}-${i}`}
                  src={src}
                  alt="Press logo"
                  width={120}
                  height={32}
                  className="h-6 md:h-8 w-auto object-contain opacity-70 brightness-0 invert"
                  loading="lazy"
                />
              ))}
            </div>
          </div>
        </section>

        {/* ─── Meet the Stylists ─── */}
        <section className="container max-w-6xl py-16 md:py-24">
          <Reveal>
            <div className="text-center mb-12">
              <h2 className="font-display text-3xl md:text-4xl mb-3">
                Meet Our Wishi Stylists
              </h2>
              <p className="font-body text-base text-muted-foreground max-w-lg mx-auto">
                Take our quiz to get matched with one of our expert stylists. From petite to plus size, our diverse team is here to style you for every occasion.
              </p>
            </div>
          </Reveal>

          {/* Bento grid: featured left + 2×3 right */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr] gap-4">
            {/* Featured stylist — tall left card. Loveable does NOT wrap this
                in a link; it's a static visual lockup. */}
            <Reveal>
              <div className="relative aspect-[3/4] md:aspect-auto md:h-full overflow-hidden rounded-2xl block">
                <Image
                  src={featured.image}
                  alt={featured.name}
                  fill
                  sizes="(min-width: 768px) 40vw, 100vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-6 left-6 right-6">
                  <h3 className="font-display text-3xl md:text-4xl text-white leading-tight">
                    {featured.name}
                  </h3>
                  <p className="font-body text-sm text-white/80 mt-1 whitespace-pre-line">
                    {featured.subtitle}
                  </p>
                </div>
              </div>
            </Reveal>

            {/* Right grid — 2 rows × 3 cols */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {gridStylists.map((s, i) => (
                <Reveal key={s.name} delay={i * 80}>
                  {/* Loveable links each card to /stylists/{slug}. Our DB
                      doesn't carry these mock IDs, so the directory at
                      /stylists is the closest functional equivalent — the
                      JSX shape is identical. */}
                  <Link
                    href="/stylists"
                    className="relative aspect-[3/4] overflow-hidden rounded-2xl group cursor-pointer block"
                  >
                    <Image
                      src={s.image}
                      alt={s.name}
                      fill
                      sizes="(min-width: 768px) 20vw, 50vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4">
                      <h3 className="font-display text-xl md:text-2xl text-white italic">
                        {s.name}
                      </h3>
                      <div className="flex gap-1.5 mt-1.5">
                        {s.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-white/20 backdrop-blur-sm px-3 py-0.5 text-xs font-body text-white"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>

          <div className="text-center mt-10">
            <Link
              href={matchHref}
              className="inline-flex items-center justify-center rounded-full bg-foreground text-background px-8 py-3 text-sm font-body font-medium hover:bg-foreground/90 transition-colors"
            >
              Find Your Best Match
            </Link>
          </div>
        </section>

        {/* ─── How It Works ─── */}
        <section>
          <div className="container max-w-5xl py-14 md:py-20">
            <Reveal>
              <h2 className="font-display text-3xl md:text-4xl text-center mb-12">
                How it Works
              </h2>
            </Reveal>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
              {steps.map((step) => (
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
                className="inline-flex items-center justify-center rounded-full border border-foreground text-foreground px-8 py-3 text-sm font-body font-medium hover:bg-foreground hover:text-background transition-colors"
              >
                Learn More
              </Link>
            </div>
          </div>
        </section>

        {/* ─── Pricing ─── */}
        <section className="container max-w-5xl py-16 md:py-24">
          <Reveal>
            <h2 className="font-display text-3xl md:text-4xl text-center mb-4">
              A Perfect Fit For Everyone
            </h2>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            {planTierOrder.map((tier) => (
              <Reveal key={tier}>
                <div className="rounded-xl border border-border bg-card flex flex-col h-full hover:shadow-md transition-shadow overflow-hidden">
                  <div className={`h-1.5 w-full ${tierAccent[tier]}`} />
                  <div className="p-8 flex flex-col flex-1">
                    <p className="font-body text-sm text-foreground text-center mb-3">
                      {tierLandingLabel[tier]}
                    </p>
                    <h3 className="font-display text-2xl text-center mb-2">{tierName[tier]}</h3>
                    <p className="font-display text-4xl text-center mb-6">{`$${priceFor[tier]}`}</p>

                    {tierShortFeatures[tier].length > 0 ? (
                      <div className="space-y-3 flex-1">
                        {tierShortFeatures[tier].map((f) => (
                          <p key={f} className="font-body text-sm text-foreground">
                            {f}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="font-body text-sm text-foreground flex-1">
                        {tierLuxDescription}
                      </p>
                    )}

                    <Link
                      href="/pricing"
                      className="mt-8 inline-flex items-center justify-center rounded-lg border border-foreground text-foreground px-6 py-2.5 text-sm font-body font-medium hover:bg-foreground hover:text-background transition-colors text-center"
                    >
                      Learn More
                    </Link>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ─── #StyledByWishi ─── */}
        <section className="bg-muted/30 border-t border-border">
          <div className="container max-w-6xl py-16 md:py-24">
            <Reveal>
              <div className="text-center mb-12">
                <h2 className="font-display text-3xl md:text-4xl mb-3">
                  #StyledByWishi
                </h2>
                <p className="font-body text-base text-muted-foreground max-w-lg mx-auto">
                  Our stylists have access to every brand in the world, from designer to high street. Best of all, they can style you from your own closet!
                </p>
              </div>
            </Reveal>

            {/* Desktop: 4-up grid, fixed 24px gap */}
            <div className="hidden md:grid grid-cols-4 gap-[24px] max-w-full mx-auto">
              {styledLooks.map((src, i) => (
                <div key={src} className="relative aspect-[601/712] overflow-hidden rounded-xl">
                  <Image
                    src={src}
                    alt={`Styled look ${i + 1}`}
                    fill
                    sizes="(min-width: 768px) 25vw, 50vw"
                    className="object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>

            {/* Mobile: horizontal carousel with snap + dots */}
            <StyledLooksCarousel looks={styledLooks} />

            <div className="text-center mt-12">
              <Link
                href="/feed"
                className="inline-flex items-center justify-center rounded-[4px] border border-foreground text-foreground px-8 py-3 text-sm font-body font-medium hover:bg-foreground hover:text-background transition-colors"
              >
                View more looks
              </Link>
            </div>
          </div>
        </section>

        {/* ─── Concierge Banner ─── */}
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
              <p className="font-body text-sm text-muted-foreground max-w-sm mx-auto mb-8 leading-relaxed">
                Schedule a complimentary consultation with Wishi Concierge to discuss your style goals and find a plan tailored to you.
              </p>
              <a
                href="https://calendly.com/ninane-wishi/wishi-consultation?month=2026-04"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center border border-foreground rounded-none px-8 py-3 font-body text-sm hover:bg-foreground hover:text-background transition-colors"
              >
                Schedule consultation
              </a>
            </div>
          </div>
        </section>

        {/* ─── Reviews ─── */}
        <section className="py-16 md:py-24 overflow-hidden">
          <div className="container max-w-5xl">
            <Reveal>
              <h2 className="font-display text-3xl md:text-4xl text-center mb-12">
                Our Clients Tell It How It Is
              </h2>
            </Reveal>
          </div>

          <div className="relative">
            <div className="flex animate-marquee gap-8" style={{ width: "max-content" }}>
              {[...reviews, ...reviews].map((r, idx) => (
                <div
                  key={`${r.author}-${idx}`}
                  className="flex flex-col w-[320px] shrink-0 border border-border rounded-xl overflow-hidden"
                >
                  {r.photo && (
                    <div className="relative aspect-[4/3] overflow-hidden">
                      <Image
                        src={r.photo}
                        alt={`${r.author}'s look`}
                        fill
                        sizes="320px"
                        className="object-cover"
                        loading="lazy"
                      />
                    </div>
                  )}
                  <div className="p-5 flex flex-col flex-1">
                    <div className="flex gap-1 mb-3">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <StarIcon
                          key={i}
                          className="h-4 w-4 fill-foreground text-foreground"
                        />
                      ))}
                    </div>
                    <p className="font-body text-sm text-foreground leading-relaxed flex-1 italic line-clamp-4">
                      &ldquo;{r.text}&rdquo;
                    </p>
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="font-display text-sm">{r.author}</p>
                      <p className="font-body text-xs text-muted-foreground">
                        Styled by {r.stylist}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="container max-w-5xl mt-10 text-center">
            <Link
              href="/reviews"
              className="inline-flex items-center justify-center rounded-[4px] border border-foreground text-foreground px-8 py-3 text-sm font-body font-medium hover:bg-foreground hover:text-background transition-colors"
            >
              Read More Reviews
            </Link>
          </div>
        </section>

        {/* ─── FAQ ─── */}
        <section className="bg-muted/30 border-y border-border">
          <div className="container max-w-3xl py-16 md:py-24">
            <Reveal>
              <h2 className="font-display text-3xl md:text-4xl text-center mb-12">
                Your Questions, Answered
              </h2>
            </Reveal>
            <FaqList items={faqs} />
          </div>
        </section>

        {/* ─── Final CTA ─── */}
        <section className="container max-w-3xl py-20 md:py-28 text-center">
          <Reveal>
            <h2 className="font-display text-3xl md:text-5xl mb-4">
              Ready to Transform Your Wardrobe?
            </h2>
            <p className="font-body text-base text-muted-foreground max-w-md mx-auto mb-8">
              Take a quick style quiz and get matched with a stylist who truly gets your vibe.
            </p>
            <Link
              href="/match-quiz"
              className="inline-flex items-center justify-center rounded-full bg-foreground text-background px-10 py-4 text-sm font-body font-medium hover:bg-foreground/90 transition-colors"
            >
              Let&apos;s Get Styling
            </Link>
          </Reveal>
        </section>

        <SiteFooter />
      </div>
    </>
  );
}
