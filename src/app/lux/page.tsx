import type { Metadata } from "next";
import Image from "next/image";
import {
  PackageIcon,
  TruckIcon,
  GiftIcon,
  StarIcon,
} from "lucide-react";
import { SiteHeader } from "@/components/primitives/site-header";
import { SiteFooter } from "@/components/primitives/site-footer";
import { Reveal } from "@/components/primitives/reveal";
import { PillButton } from "@/components/primitives/pill-button";
import { FaqList } from "@/components/primitives/faq";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Lux Package — Wishi",
  description:
    "The most highly curated digital styling experience. 8 curated style boards, a dedicated stylist, a 30-minute video call, and concierge Wishi fulfillment.",
};

const journeySteps = [
  {
    title: "Personal Consultation Call",
    description:
      "A 30-minute video call with your stylist to talk through your lifestyle, style goals, preferences, and the looks you want to achieve.",
    image: "/img/journey-call.png",
  },
  {
    title: "Share Your Closet",
    description:
      "Add items to your closet for your stylist to review and use in your style boards.",
    image: "/img/journey-closet.png",
  },
  {
    title: "Complement Your Color & Shape",
    description:
      "Your stylist will advise on the colors and shapes that suit you best, using your preferences and inspiration photos.",
    image: "/img/journey-color.png",
  },
] as const;

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
      "Based on your feedback, your stylist curates shoppable style boards, including items from your closet.",
    image: "/img/hiw-styleboards.png",
  },
  {
    num: "3",
    title: "8 Curated Looks",
    description:
      "Lux is 8 flat styleboards. Your stylist builds a versatile, elevated wardrobe that works across your life.",
    image: "/img/hiw-purchaselinks.png",
  },
  {
    num: "4",
    title: "Revisions",
    description:
      "Give feedback on any board and your stylist refines it — thoughtfully, not endlessly.",
    image: "/img/hiw-chat.png",
  },
] as const;

// Icon-based callouts for the "Buy What You Love" section. Replaces the old
// image-card layout with the cleaner Loveable design language. Title is
// "Priority Shipping" — the "Free &" prefix from the Loveable source is
// locked-out copy per the 2026-04-07 founder decision.
const buyFeatures = [
  {
    title: "Personal Concierge",
    description:
      "Wishi fulfillment for items you buy through Wishi — tax, shipping, and returns handled end-to-end.",
    Icon: PackageIcon,
  },
  {
    title: "Priority Shipping",
    description: "Your must-have pieces, always delivered with priority shipping.",
    Icon: TruckIcon,
  },
  {
    title: "Any Brand, Any Budget",
    description:
      "Stylists can source from luxury, contemporary, and high-street brands across the entire fashion market.",
    Icon: GiftIcon,
  },
] as const;

const lifeStages = [
  {
    title: "Busy Moms",
    description:
      "Your lifestyle shapes your wardrobe. We simplify dressing so you can focus on what matters.",
    image: "/img/life-busy-mom.png",
  },
  {
    title: "Boss Ladies",
    description:
      "No time to waste. Your Lux looks deliver effortless, polished, confident workwear.",
    image: "/img/life-executives.png",
  },
  {
    title: "Life Updates",
    description:
      "Wishi adapts your wardrobe for life's big changes: promotions, motherhood, body changes, and more.",
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
    a: "Wishi matches you with a personal stylist who helps you reach your style goals no matter your budget, size, or occasion. Your session starts with an inspirational mood board, then shoppable style boards where you can buy what you love.",
  },
  {
    q: "What brands and budgets do you work with?",
    a: "Your stylist can curate from any brand or retailer at any price point — from your go-to labels to emerging designers you haven't discovered yet.",
  },
  {
    q: "Is Wishi a subscription service?",
    a: "Wishi is not a box subscription. We offer one-time or recurring monthly services where stylists build looks for you to shop.",
  },
  {
    q: "What if I don't like what my stylist suggests?",
    a: "You can request a different stylist any time. Let us know who you'd like to work with and we'll take care of the rest.",
  },
  {
    q: "Which styling plan should I choose?",
    a: "Major includes 5 personalized style boards. Lux includes 8 curated style boards, a dedicated stylist, and a 30-minute video call for a fully personalized experience.",
  },
  {
    q: "How will the stylist know what I look like?",
    a: "Your style preferences help your stylist get to know you. You can also upload a photo of yourself from your profile — that's equally useful.",
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
      <main className="min-h-screen bg-background">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="mx-auto max-w-6xl px-6 md:px-10 py-20 md:py-28">
            <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
              <div className="flex-1 text-center lg:text-left">
                <h1 className="font-display text-5xl md:text-6xl lg:text-7xl leading-[1.05] tracking-tight mb-6">
                  The LUX Experience
                </h1>
                <p className="text-lg text-muted-foreground max-w-md mx-auto lg:mx-0 mb-8 leading-relaxed">
                  The most highly curated digital styling experience — 8 style boards, a dedicated
                  stylist, and a 30-minute video call included.
                </p>
                <PillButton href="/welcome" variant="solid" size="lg">
                  Get Started
                </PillButton>
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

        {/* Journey */}
        <section className="bg-muted/30 border-y border-border">
          <div className="mx-auto max-w-5xl px-6 md:px-10 py-16 md:py-24">
            <Reveal>
              <div className="text-center mb-4">
                <h2 className="font-display text-3xl md:text-4xl mb-3">
                  Start Your Styling Journey
                </h2>
                <p className="text-base text-muted-foreground max-w-lg mx-auto">
                  We begin by understanding your unique aesthetic and lifestyle through:
                </p>
              </div>
            </Reveal>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
              {journeySteps.map((step, i) => (
                <Reveal key={step.title} delay={i * 80}>
                  <div className="text-center">
                    <div className="relative aspect-[4/5] overflow-hidden rounded-xl mb-5">
                      <Image
                        src={step.image}
                        alt={step.title}
                        fill
                        sizes="(min-width: 768px) 33vw, 100vw"
                        className="object-cover"
                      />
                    </div>
                    <h3 className="font-display text-xl mb-2">{step.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
            <div className="text-center mt-12">
              <PillButton href="/welcome" variant="solid" size="lg">
                Get Started
              </PillButton>
            </div>
          </div>
        </section>

        {/* Process */}
        <section className="py-16 md:py-24">
          <div className="mx-auto max-w-5xl px-6 md:px-10">
            <Reveal>
              <h2 className="font-display text-3xl md:text-4xl text-center mb-14">
                The Styling Process
              </h2>
            </Reveal>
            <div className="space-y-16">
              {processSteps.map((step, i) => (
                <Reveal key={step.num} delay={i * 60}>
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
                        />
                      </div>
                    </div>
                    <div className="flex-1 text-center md:text-left">
                      <span className="inline-flex items-center justify-center h-10 w-10 rounded-full border-2 border-foreground font-display text-lg mb-4">
                        {step.num}
                      </span>
                      <h3 className="font-display text-2xl mb-3">{step.title}</h3>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Concierge Banner */}
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
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-8 leading-relaxed">
                Schedule a complimentary consultation with Wishi Concierge to discuss your style
                goals and find a plan tailored to you.
              </p>
              <a
                href="https://calendly.com/ninane-wishi/wishi-consultation?month=2026-04"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center border border-foreground rounded-none px-8 py-3 text-sm hover:bg-foreground hover:text-background transition-colors"
              >
                Schedule consultation
              </a>
            </div>
          </div>
        </section>

        {/* Buy What You Love — icon-based callouts */}
        <section className="bg-muted/30 border-y border-border">
          <div className="mx-auto max-w-5xl px-6 md:px-10 py-16 md:py-24">
            <Reveal>
              <h2 className="font-display text-3xl md:text-4xl text-center mb-14">
                Buy What You Love
              </h2>
            </Reveal>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
              {buyFeatures.map(({ title, description, Icon }, i) => (
                <Reveal key={title} delay={i * 80}>
                  <div className="flex items-start gap-4">
                    <Icon className="h-10 w-10 shrink-0 text-foreground stroke-[1.2]" />
                    <div>
                      <h3 className="font-display text-lg mb-1">{title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {description}
                      </p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Exclusive perk — Wishi Lux Bag with image */}
        <section className="py-16 md:py-24">
          <div className="mx-auto max-w-5xl px-6 md:px-10">
            <Reveal>
              <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-10 rounded-2xl border border-border bg-card p-10 md:p-14">
                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-lg">
                  <Image
                    src="/img/lux-gift.png"
                    alt="Wishi Lux gift bag with thank-you card"
                    fill
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
                <div className="text-center md:text-left">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
                    A gift from us
                  </p>
                  <h2 className="font-display text-3xl md:text-4xl mb-4">
                    The Wishi Lux Bag: An Exclusive Perk
                  </h2>
                  <p className="text-base text-muted-foreground max-w-lg leading-relaxed">
                    When you book Lux, you&apos;ll receive an exclusive bag filled with Wishi
                    essentials — because great style deserves a little something extra.
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Reviews */}
        <section className="bg-muted/30 border-y border-border">
          <div className="mx-auto max-w-5xl px-6 md:px-10 py-16 md:py-24">
            <Reveal>
              <h2 className="font-display text-3xl md:text-4xl text-center mb-14">
                #StyledByWishi
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
                    <p className="font-display text-base mt-4 pt-4 border-t border-border">
                      — {r.author}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
            <div className="text-center mt-12">
              <PillButton href="/welcome" variant="solid" size="lg">
                Book a Stylist
              </PillButton>
            </div>
          </div>
        </section>

        {/* Life stages — image cards with overlay */}
        <section className="bg-foreground text-background py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-6 md:px-10">
            <Reveal>
              <h2 className="font-display text-3xl md:text-4xl text-center mb-14">
                Wishi Is For Every Stage Of Your Life
              </h2>
            </Reveal>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
              {lifeStages.map((stage, i) => (
                <Reveal key={stage.title} delay={i * 100}>
                  <div className="flex flex-col h-full">
                    <div className="relative aspect-square overflow-hidden">
                      <Image
                        src={stage.image}
                        alt={stage.title}
                        fill
                        sizes="(min-width: 768px) 33vw, 100vw"
                        className="object-cover"
                      />
                      <div className="absolute inset-0 bg-black/30" />
                      <h3 className="absolute bottom-6 left-6 right-6 font-display text-2xl md:text-3xl text-white">
                        {stage.title}
                      </h3>
                    </div>
                    <div className="px-6 py-6 text-center">
                      <p className="text-sm text-background/70 leading-relaxed">
                        {stage.description}
                      </p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Consultation CTA */}
        <section className="bg-muted/30 border-y border-border">
          <div className="mx-auto max-w-3xl px-6 md:px-10 py-16 md:py-24 text-center">
            <Reveal>
              <h2 className="font-display text-3xl md:text-4xl mb-4">
                Not Sure Which Plan Suits You Best?
              </h2>
              <p className="text-base text-muted-foreground max-w-md mx-auto mb-8 leading-relaxed">
                Schedule a free consultation to discuss your style goals. We&apos;ll help you find
                the perfect fit for your needs.
              </p>
              <PillButton href="/welcome" variant="solid" size="lg">
                Schedule Your Free Consultation
              </PillButton>
            </Reveal>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 md:py-24">
          <div className="mx-auto max-w-3xl px-6 md:px-10">
            <Reveal>
              <h2 className="font-display text-3xl md:text-4xl text-center mb-12">
                Your Questions, Answered
              </h2>
            </Reveal>
            <FaqList items={faqs} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
