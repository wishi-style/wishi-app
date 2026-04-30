import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  PackageIcon,
  TruckIcon,
  GiftIcon,
  StarIcon,
} from "lucide-react";
import { SiteHeader } from "@/components/primitives/site-header";
import { SiteFooter } from "@/components/primitives/site-footer";
import { Reveal } from "@/components/primitives/reveal";
import { FaqList } from "@/components/primitives/faq";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Lux Package — Wishi",
  description:
    "The most highly curated digital styling experience in the industry.",
};

// Order matches Loveable LuxPackage.tsx:28-44 — Share Your Closet first.
const journeySteps = [
  {
    title: "Share Your Closet",
    description:
      "Add items to your closet for your stylist to review and use in style boards.",
    image: "/img/journey-closet.png",
  },
  {
    title: "Personal Consultation Call",
    description:
      "Get to know your stylist and have a conversation about your lifestyle, style goals, preferences, and the looks you want to achieve.",
    image: "/img/journey-call.png",
  },
  {
    title: "Complement Your Color & Shape",
    description:
      "Your stylist will advise on the colors and shapes that suit you best, using your preferences and inspiration photos.",
    image: "/img/journey-color.png",
  },
] as const;

// Step 3 title remains "8 Curated Looks" instead of Loveable's "Capsule
// Wardrobe" — "2 seasonal capsules" is locked-out copy per founder
// decision 2026-04-07 (see CLAUDE.md "Locked decisions in effect").
const processSteps = [
  {
    num: "1",
    title: "Mood Board",
    description:
      "Your stylist creates a Mood Board with inspiration images to set the tone and aesthetics of the session.",
    image: "/img/hiw-moodboard.png",
  },
  {
    num: "2",
    title: "Style Boards",
    description:
      "Based on your feedback, your stylist curates shoppable style boards, including items from your closet!",
    image: "/img/hiw-styleboards.png",
  },
  {
    num: "3",
    title: "8 Curated Looks",
    description:
      "Your stylist builds a versatile, elevated wardrobe of 8 styleboards that work across your life.",
    image: "/img/hiw-purchaselinks.png",
  },
  {
    num: "4",
    title: "Revisions",
    description:
      "Provide feedback on your style boards, and your stylist will make thoughtful adjustments to refine the selection.",
    image: "/img/hiw-chat.png",
  },
] as const;

// Title 2 remains "Priority Shipping" — "free and priority shipping" is
// locked-out copy per founder decision 2026-04-07.
const buyFeatures = [
  {
    title: "Personal Concierge Service",
    description:
      "Our concierge guides you through the process, make sure your expectations and needs are met.",
    Icon: PackageIcon,
  },
  {
    title: "Priority Shipping",
    description:
      "Your must-have pieces, always delivered with priority shipping.",
    Icon: TruckIcon,
  },
  {
    title: "Any Brand, Any Budget",
    description:
      "Stylists can source from luxury to contemporary to high street depending on your preferences.",
    Icon: GiftIcon,
  },
] as const;

const lifeStages = [
  {
    title: "Busy Moms",
    description:
      "Your lifestyle shapes your wardrobe. We simplify dressing so you can focus on what matters!",
    image: "/img/life-busy-mom.png",
  },
  {
    title: "Executives",
    description:
      "No time to waste! Your Wishi capsule delivers effortless, polished, and confident workwear!",
    image: "/img/life-executives.png",
  },
  {
    title: "Life Updates",
    description:
      "Wishi adapts your wardrobe for life's big changes: promotions, motherhood, body changes, and more!",
    image: "/img/life-updates.png",
  },
] as const;

const reviews = [
  {
    text: "Adriana is excellent at finding exactly what you want but also empowering to push your style! I've done multiple sessions and keep coming back.",
    author: "Naomi C.",
  },
  {
    text: "Ashley read my closet tea leaves, accurately tracked my vibe, and recommended great elevated pieces. She is always positive, always professional and easy to work with.",
    author: "Dave M.",
  },
  {
    text: "The 30-minute call with Alicia made me feel more confident about the process and reassured me that I'm actually working with a real person. She has amazing taste and provides excellent service.",
    author: "Stacey",
  },
] as const;

const faqs = [
  {
    q: "How does this service work?",
    a: "Wishi matches you with a personal stylist that will help you reach your style goals no matter your budget, size, event, etc. Your session will start off with your stylist sending an inspirational mood board to set the tone of the session. From there, your stylist will send over your shoppable style boards where you can buy what you love!",
  },
  {
    q: "What brands and budgets do you work with?",
    a: "The beauty of Wishi is the ability to be styled from any brand or retailer, at any price point, across the internet. Your stylist can curate pieces from your favorite go-to brands while also introducing you to emerging designers and brands you may not have discovered.",
  },
  {
    q: "Is Wishi a subscription service?",
    a: "Wishi is not a box subscription service. However, we do offer one-time or recurring monthly services where our stylists build looks for you to shop from.",
  },
  {
    q: "What if I don't like what my stylist suggests?",
    a: "You can always request a different stylist! Just let us know who you'd like to work with and we'll take care of the rest.",
  },
  {
    q: "Which styling plan should I choose?",
    a: "Start with the Major or Lux plan. The Major includes 5 personalized style boards. The Lux offers 8 boards and a Zoom call with your stylist for a truly personalized experience.",
  },
  {
    q: "How will the stylist know what I look like?",
    a: 'Your style preferences help your stylist get to know you better. But if you\'d like to upload a picture of yourself, that is also helpful! You can do so by heading to "Me" > Photos > "+"',
  },
] as const;

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function LuxPage() {
  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      <SiteHeader />
      <div className="min-h-screen bg-background">
        {/* Hero — Loveable LuxPackage.tsx:99-121 */}
        <section className="relative overflow-hidden">
          <div className="container max-w-6xl py-20 md:py-28">
            <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
              <div className="flex-1 text-center lg:text-left">
                <h1 className="font-display text-5xl md:text-6xl lg:text-7xl leading-[1.05] tracking-tight mb-6">
                  The LUX Experience
                </h1>
                <p className="font-body text-lg text-muted-foreground max-w-md mx-auto lg:mx-0 mb-8 leading-relaxed">
                  The most highly curated digital styling experience in the
                  industry.
                </p>
                <Link
                  href="/how-it-works"
                  className="inline-flex items-center justify-center rounded-md bg-foreground text-background px-10 py-3.5 text-sm font-body font-medium hover:bg-foreground/90 transition-colors"
                >
                  Get Started
                </Link>
              </div>
              <div className="flex-1 w-full max-w-xl">
                <Image
                  src="/img/lux-hero.png"
                  alt="Wishi Lux mood board collage"
                  width={900}
                  height={900}
                  priority
                  className="w-full h-auto"
                  sizes="(min-width: 1024px) 50vw, 100vw"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Start Your Styling Journey — Loveable LuxPackage.tsx:124-158 */}
        <section className="bg-muted/30 border-y border-border">
          <div className="container max-w-5xl py-16 md:py-24">
            <Reveal>
              <div className="text-center mb-4">
                <h2 className="font-display text-3xl md:text-4xl mb-3">
                  Start Your Styling Journey
                </h2>
                <p className="font-body text-base text-muted-foreground max-w-lg mx-auto">
                  We begin by understanding your unique aesthetic and lifestyle
                  through:
                </p>
              </div>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
              {journeySteps.map((step) => (
                <Reveal key={step.title}>
                  <div className="text-center">
                    <div className="relative aspect-[4/5] overflow-hidden rounded-xl mb-5">
                      <Image
                        src={step.image}
                        alt={step.title}
                        fill
                        sizes="(min-width: 768px) 33vw, 100vw"
                        className="object-cover"
                        loading="lazy"
                      />
                    </div>
                    <h3 className="font-display text-xl mb-2">{step.title}</h3>
                    <p className="font-body text-sm text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>

            <div className="text-center mt-12">
              <Link
                href="/how-it-works"
                className="inline-flex items-center justify-center rounded-md bg-foreground text-background px-10 py-3.5 text-sm font-body font-medium hover:bg-foreground/90 transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        </section>

        {/* The Styling Process — Loveable LuxPackage.tsx:161-187 */}
        <section className="container max-w-5xl py-16 md:py-24">
          <Reveal>
            <h2 className="font-display text-3xl md:text-4xl text-center mb-14">
              The Styling Process
            </h2>
          </Reveal>

          <div className="space-y-16">
            {processSteps.map((step, i) => (
              <Reveal key={step.num}>
                <div
                  className={cn(
                    "flex flex-col md:flex-row items-center gap-10",
                    i % 2 !== 0 && "md:flex-row-reverse",
                  )}
                >
                  <div className="flex-1 w-full">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl">
                      <Image
                        src={step.image}
                        alt={step.title}
                        fill
                        sizes="(min-width: 768px) 50vw, 100vw"
                        className="object-cover"
                        loading="lazy"
                      />
                    </div>
                  </div>
                  <div className="flex-1 text-center md:text-left">
                    <span className="inline-flex items-center justify-center h-10 w-10 rounded-full border-2 border-foreground font-display text-lg mb-4">
                      {step.num}
                    </span>
                    <h3 className="font-display text-2xl mb-3">{step.title}</h3>
                    <p className="font-body text-base text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Concierge Banner — Loveable LuxPackage.tsx:189-214 */}
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
              <h2 className="font-display text-3xl md:text-4xl mb-4">
                Chat with us.
              </h2>
              <p className="font-body text-sm text-muted-foreground max-w-sm mx-auto mb-8 leading-relaxed">
                Schedule a complimentary consultation with Wishi Concierge to
                discuss your style goals and find a plan tailored to you.
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

        {/* Buy What You Love — Loveable LuxPackage.tsx:215-238 */}
        <section className="bg-muted/30 border-y border-border">
          <div className="container max-w-5xl py-16 md:py-24">
            <Reveal>
              <h2 className="font-display text-3xl md:text-4xl text-center mb-14">
                Buy What You Love
              </h2>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
              {buyFeatures.map(({ title, description, Icon }) => (
                <Reveal key={title}>
                  <div className="flex items-start gap-4">
                    <Icon className="h-10 w-10 shrink-0 text-foreground stroke-[1.2]" />
                    <div>
                      <h3 className="font-display text-lg mb-1">{title}</h3>
                      <p className="font-body text-sm text-muted-foreground leading-relaxed">
                        {description}
                      </p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Exclusive Perk — Loveable LuxPackage.tsx:241-258 */}
        <section className="container max-w-5xl py-16 md:py-24">
          <Reveal>
            <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-10 rounded-2xl border border-border bg-card p-10 md:p-14">
              <div className="overflow-hidden rounded-2xl shadow-lg">
                <Image
                  src="/img/lux-gift.png"
                  alt="Wishi Lux gift bag with thank you card"
                  width={800}
                  height={800}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="text-center md:text-left">
                <p className="font-body text-xs uppercase tracking-widest text-muted-foreground mb-3">
                  A Gift From Us!
                </p>
                <h2 className="font-display text-3xl md:text-4xl mb-4">
                  The Wishi Lux Bag: An Exclusive Perk
                </h2>
                <p className="font-body text-base text-muted-foreground max-w-lg leading-relaxed">
                  When you book a Wishi Lux Plan, you&apos;ll receive an
                  exclusive bag filled with Wishi essentials — because great
                  style deserves a little something extra.
                </p>
              </div>
            </div>
          </Reveal>
        </section>

        {/* #StyledbyWishi reviews — Loveable LuxPackage.tsx:261-294 */}
        <section className="bg-muted/30 border-y border-border">
          <div className="container max-w-5xl py-16 md:py-24">
            <Reveal>
              <h2 className="font-display text-3xl md:text-4xl text-center mb-14">
                #StyledbyWishi
              </h2>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {reviews.map((r) => (
                <Reveal key={r.author}>
                  <div className="flex flex-col h-full">
                    <div className="flex gap-1 mb-4">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <StarIcon
                          key={i}
                          className="h-4 w-4 fill-foreground text-foreground"
                        />
                      ))}
                    </div>
                    <p className="font-body text-base text-foreground leading-relaxed flex-1 italic">
                      &ldquo;{r.text}&rdquo;
                    </p>
                    <p className="font-display text-base mt-4 pt-4 border-t border-border">
                      — {r.author}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>

            <div className="text-center mt-12">
              <Link
                href="/discover"
                className="inline-flex items-center justify-center rounded-md bg-foreground text-background px-10 py-3.5 text-sm font-body font-medium hover:bg-foreground/90 transition-colors"
              >
                Book a Stylist
              </Link>
            </div>
          </div>
        </section>

        {/* Every Stage of Life — Loveable LuxPackage.tsx:297-324 */}
        <section className="bg-foreground text-background py-16 md:py-24">
          <div className="container max-w-6xl">
            <Reveal>
              <h2 className="font-display text-3xl md:text-4xl text-center mb-14">
                Wishi Is For Every Stage Of Your Life
              </h2>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
              {lifeStages.map((stage) => (
                <Reveal key={stage.title}>
                  <div className="flex flex-col h-full">
                    <div className="relative aspect-square overflow-hidden">
                      <Image
                        src={stage.image}
                        alt={stage.title}
                        fill
                        sizes="(min-width: 768px) 33vw, 100vw"
                        className="object-cover"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/30" />
                      <h3 className="absolute bottom-6 left-6 right-6 font-display text-2xl md:text-3xl text-white">
                        {stage.title}
                      </h3>
                    </div>
                    <div className="px-6 py-6 text-center">
                      <p className="font-body text-sm text-background/70 leading-relaxed">
                        {stage.description}
                      </p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ — Loveable LuxPackage.tsx:328-337 */}
        <section className="container max-w-3xl py-16 md:py-24">
          <Reveal>
            <h2 className="font-display text-3xl md:text-4xl text-center mb-12">
              Your Questions, Answered
            </h2>
          </Reveal>
          <FaqList items={faqs} />
        </section>
      </div>
      <SiteFooter />
    </>
  );
}
