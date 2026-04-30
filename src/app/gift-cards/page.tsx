import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SparklesIcon, ShoppingBagIcon, UsersIcon } from "lucide-react";
import { SiteHeader } from "@/components/primitives/site-header";
import { SiteFooter } from "@/components/primitives/site-footer";
import { getPlanPricesForUi } from "@/lib/plans";
import { getServerAuth } from "@/lib/auth/server-auth";
import { BuyGiftCardDialog } from "./buy-gift-card-dialog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gift cards — Wishi",
  description:
    "Give the gift of style. A Wishi stylist curates personal, shoppable looks for whoever you love.",
  alternates: { canonical: "/gift-cards" },
};

// Loveable's gift-card CTAs all use a dark-wine rectangular button. Match
// the same hsl + dimensions across the page (GiftCards.tsx lines 82, 156,
// 191, 226).
const WINE_BUTTON =
  "bg-[hsl(0,60%,20%)] hover:bg-[hsl(0,60%,15%)] text-white rounded-sm h-auto px-10 py-6 text-sm font-body";

const benefits = [
  {
    icon: UsersIcon,
    title: "Access to Professional Stylists",
    description:
      "Every Wishi stylist is trained by celebrity stylist Karla Welch, the creative force behind Olivia Wilde, Sarah Paulson, and Tracee Ellis Ross's most iconic looks.",
  },
  {
    icon: SparklesIcon,
    title: "Personalized Recommendations",
    description:
      "Wishi stylists create unique, shoppable style boards tailored to your recipient's taste, body type, and lifestyle.",
  },
  {
    icon: ShoppingBagIcon,
    title: "Add Shopping Credit",
    description:
      "Enhance their experience with built-in shopping credit. With thousands of curated items at their fingertips, they can shop the pieces they love directly through Wishi.",
  },
];

const steps = [
  {
    num: "01",
    title: "Purchase the gift card",
    desc: "The recipient will receive an email, letting them know they've been gifted a personalized styling experience.",
  },
  {
    num: "02",
    title: "Share style preferences",
    desc: "The recipient completes a fun and easy style quiz sharing their fashion preferences, needs and goals.",
  },
  {
    num: "03",
    title: "Stylist gets to work",
    desc: "A professional stylist reviews the recipient's answers and curates shoppable looks just for them.",
  },
  {
    num: "04",
    title: "Shop the Looks",
    desc: "The recipient receives personalized outfits with direct shopping links, making it easy to add pieces to their closet.",
  },
];

export default async function GiftCardsPage() {
  const prices = await getPlanPricesForUi();
  const { userId: clerkId } = await getServerAuth();
  const isAuthed = !!clerkId;

  const planCards = [
    {
      name: "Mini Session",
      image: "/img/gift-card-mini.jpg",
      priceInCents: prices.mini.priceInCents,
      priceDollars: prices.mini.displayDollars,
      features: ["2 Style Boards", "1:1 Chat with Stylist", "Revisions"],
    },
    {
      name: "Major Session",
      image: "/img/gift-card-major.jpg",
      priceInCents: prices.major.priceInCents,
      priceDollars: prices.major.displayDollars,
      features: ["5 Style Boards", "1:1 Chat with Stylist", "Revisions"],
      popular: true,
    },
    {
      name: "Lux Session",
      image: "/img/gift-card-lux.jpg",
      priceInCents: prices.lux.priceInCents,
      priceDollars: prices.lux.displayDollars,
      description:
        "A highly personalized session with a dedicated stylist to take your wardrobe to the next level.",
    },
  ];

  return (
    <>
      <SiteHeader />
      <div className="min-h-screen bg-background">
        {/* Hero — Loveable GiftCards.tsx:71-91 */}
        <section className="relative overflow-hidden bg-card">
          <div className="container grid md:grid-cols-2 items-center gap-0">
            <div className="relative aspect-[4/3] md:aspect-auto md:h-[520px] overflow-hidden">
              <Image
                src="/img/gift-card-hero.png"
                alt="Wishi Gift Card"
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                className="object-cover"
                priority
              />
            </div>
            <div className="px-6 py-12 md:py-0 md:px-16 text-center">
              <p className="font-display italic text-lg text-muted-foreground mb-4">
                Wishi Gift Card for
              </p>
              <h1 className="font-display text-2xl md:text-3xl lg:text-4xl leading-snug">
                For anyone ready to have fun with their{" "}
                <em className="font-display italic">style</em> again.
              </h1>
              <div className="mt-8">
                <BuyGiftCardDialog
                  isAuthed={isAuthed}
                  label="Buy gift cards"
                  className={WINE_BUTTON}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Plans — Loveable GiftCards.tsx:94-135 */}
        <section className="py-20 md:py-28">
          <div className="container">
            <h2 className="font-display text-3xl md:text-4xl text-center mb-16">
              No need to search for something they might return.
            </h2>
            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {planCards.map((plan) => (
                <div
                  key={plan.name}
                  className={`rounded-lg border bg-card p-6 text-center flex flex-col items-center ${
                    plan.popular
                      ? "border-foreground/30 shadow-lg"
                      : "border-border"
                  }`}
                >
                  <div className="relative w-full aspect-[5/3] rounded-md overflow-hidden mb-6">
                    <Image
                      src={plan.image}
                      alt={plan.name}
                      fill
                      sizes="(min-width: 768px) 33vw, 100vw"
                      className="object-cover"
                      loading="lazy"
                    />
                  </div>
                  <h3 className="font-display text-xl mb-3">{plan.name}</h3>
                  {plan.features ? (
                    <ul className="font-body text-sm text-muted-foreground space-y-1.5 mb-6">
                      {plan.features.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="font-body text-sm text-muted-foreground mb-4">
                      {plan.description}{" "}
                      <Link
                        href="/lux"
                        className="underline hover:text-foreground"
                      >
                        Learn More
                      </Link>
                    </p>
                  )}
                  <p className="font-display text-2xl mb-5">
                    {`$${plan.priceDollars}`}
                  </p>
                  <BuyGiftCardDialog
                    isAuthed={isAuthed}
                    defaultAmountInCents={plan.priceInCents}
                    label={`Gift ${plan.name.split(" ")[0]}`}
                    variant="outline"
                    className="rounded-sm w-full font-body text-xs"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits — Loveable GiftCards.tsx:138-164 */}
        <section className="py-20 md:py-28 bg-card">
          <div className="container">
            <h2 className="font-display text-3xl md:text-4xl text-center mb-16">
              Wishi Gift Card Benefits
            </h2>
            <div className="grid md:grid-cols-3 gap-10 max-w-5xl mx-auto">
              {benefits.map((b) => {
                const Icon = b.icon;
                return (
                  <div key={b.title} className="text-center">
                    <div className="mx-auto w-14 h-14 rounded-full bg-secondary flex items-center justify-center mb-5">
                      <Icon className="h-6 w-6 text-foreground" />
                    </div>
                    <h3 className="font-display text-lg mb-3">{b.title}</h3>
                    <p className="font-body text-sm text-muted-foreground leading-relaxed">
                      {b.description}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="text-center mt-14">
              <BuyGiftCardDialog
                isAuthed={isAuthed}
                label="Buy gift cards"
                className={WINE_BUTTON}
              />
            </div>
          </div>
        </section>

        {/* Corporate Gifting — Loveable GiftCards.tsx:167-200. Image with
            card-overlay lockup on the left, copy + Schedule CTA on the
            right. */}
        <section className="bg-card">
          <div className="container grid md:grid-cols-2 items-stretch gap-0 p-0 max-w-none">
            <div className="relative h-[400px] md:h-[580px] overflow-hidden">
              <Image
                src="/img/corporate-gifting-bg.png"
                alt="Corporate Gifting"
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                className="object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-[260px] md:w-[320px]">
                  <Image
                    src="/img/gift-card-overlay.png"
                    alt="Wishi Gift Card"
                    width={320}
                    height={200}
                    className="w-full h-auto"
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-display text-3xl md:text-4xl text-foreground/80 tracking-wide">
                      wishi
                    </span>
                    <span className="font-body text-xs md:text-sm tracking-[0.3em] uppercase text-foreground/60 mt-1">
                      Gift Card
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col justify-center px-8 py-14 md:px-16 md:py-0">
              <h2 className="font-display italic text-3xl md:text-4xl mb-6">
                Corporate Gifting
              </h2>
              <p className="font-body text-muted-foreground leading-relaxed mb-8 max-w-md">
                Give your team or clients a gift they&apos;ll actually love: a
                Wishi Gift Card. From workwear to weekend looks, a pro stylist
                curates outfits just for them.
                <br />
                Thoughtful, effortless, and undeniably chic.
              </p>
              <div>
                <a
                  href="https://calendly.com/ninane-wishi/wishi-consultation?month=2026-04"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center justify-center ${WINE_BUTTON.replace("h-auto px-10 py-6", "px-12 py-6")}`}
                >
                  Schedule A Call
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* The Wishi Gift Card Experience — Loveable GiftCards.tsx:203-233 */}
        <section className="py-20 md:py-28 bg-card">
          <div className="container">
            <h2 className="font-display text-3xl md:text-4xl text-center mb-16">
              The Wishi Gift Card Experience
            </h2>
            <div className="grid md:grid-cols-2 gap-12 max-w-5xl mx-auto items-center">
              <div className="flex justify-center">
                <Image
                  src="/img/gift-card-experience.png"
                  alt="Wishi styling session on phone"
                  width={680}
                  height={680}
                  className="w-full max-w-[340px] rounded-2xl"
                  loading="lazy"
                />
              </div>
              <div className="space-y-8">
                {steps.map((step) => (
                  <div key={step.num} className="flex gap-5">
                    <span className="font-display italic text-2xl text-muted-foreground shrink-0">
                      {step.num}
                    </span>
                    <div>
                      <h3 className="font-display text-lg mb-1">{step.title}</h3>
                      <p className="font-body text-sm text-muted-foreground leading-relaxed">
                        {step.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="text-center mt-14">
              <BuyGiftCardDialog
                isAuthed={isAuthed}
                label="Buy gift cards"
                className={WINE_BUTTON}
              />
            </div>
          </div>
        </section>
      </div>
      <SiteFooter />
    </>
  );
}
