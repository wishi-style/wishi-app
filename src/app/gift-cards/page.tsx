import type { Metadata } from "next";
import Image from "next/image";
import { SparklesIcon, ShoppingBagIcon, UsersIcon } from "lucide-react";
import { SiteHeader } from "@/components/primitives/site-header";
import { SiteFooter } from "@/components/primitives/site-footer";
import { PillButton } from "@/components/primitives/pill-button";
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

const benefits = [
  {
    icon: UsersIcon,
    title: "Access to professional stylists",
    description:
      "Every Wishi stylist is trained by celebrity stylist Karla Welch, the creative force behind Olivia Wilde, Sarah Paulson, and Tracee Ellis Ross's most iconic looks.",
  },
  {
    icon: SparklesIcon,
    title: "Personalized recommendations",
    description:
      "Wishi stylists create unique, shoppable style boards tailored to your recipient's taste, body type, and lifestyle.",
  },
  {
    icon: ShoppingBagIcon,
    title: "Add shopping credit",
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
    title: "Shop the looks",
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
      priceInCents: prices.mini.priceInCents,
      priceDollars: prices.mini.displayDollars,
      features: ["2 Style Boards", "1:1 Chat with Stylist", "Revisions"],
    },
    {
      name: "Major Session",
      priceInCents: prices.major.priceInCents,
      priceDollars: prices.major.displayDollars,
      features: ["5 Style Boards", "1:1 Chat with Stylist", "Revisions"],
      popular: true,
    },
    {
      name: "Lux Session",
      priceInCents: prices.lux.priceInCents,
      priceDollars: prices.lux.displayDollars,
      description:
        "A highly personalized session with a dedicated stylist to take your wardrobe to the next level.",
    },
  ];

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background">
        {/* Hero */}
        <section className="relative overflow-hidden bg-card">
          <div className="mx-auto grid max-w-6xl items-center gap-0 md:grid-cols-2">
            <div className="relative aspect-[4/3] md:aspect-auto md:h-[520px]">
              <Image
                src="/img/gift-card-icon.png"
                alt="Wishi gift card"
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                className="object-cover"
                priority
              />
            </div>
            <div className="px-6 py-12 text-center md:px-16 md:py-0">
              <p className="mb-4 font-display text-lg italic text-muted-foreground">
                Wishi gift card for
              </p>
              <h1 className="font-display text-3xl leading-snug md:text-4xl">
                For anyone ready to have fun with their{" "}
                <em className="italic">style</em> again.
              </h1>
              <div className="mt-8">
                <BuyGiftCardDialog
                  isAuthed={isAuthed}
                  label="Buy a gift card"
                  className="h-11 rounded-full px-8 text-sm"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Plans */}
        <section className="py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="mb-14 text-center font-display text-3xl md:text-4xl">
              No need to search for something they might return.
            </h2>
            <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
              {planCards.map((plan) => (
                <div
                  key={plan.name}
                  className={`flex flex-col rounded-xl border bg-card p-6 text-center ${
                    plan.popular
                      ? "border-foreground/30 shadow-lg"
                      : "border-border"
                  }`}
                >
                  <h3 className="mb-3 font-display text-xl">{plan.name}</h3>
                  {plan.features ? (
                    <ul className="mb-5 flex-1 space-y-1.5 text-sm text-muted-foreground">
                      {plan.features.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mb-5 flex-1 text-sm text-muted-foreground">
                      {plan.description}
                    </p>
                  )}
                  <p className="mb-5 font-display text-2xl">
                    {`$${plan.priceDollars}`}
                  </p>
                  <BuyGiftCardDialog
                    isAuthed={isAuthed}
                    defaultAmountInCents={plan.priceInCents}
                    label={`Gift ${plan.name.split(" ")[0]}`}
                    variant="outline"
                    className="w-full"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="bg-card py-20 md:py-28">
          <div className="mx-auto max-w-5xl px-6">
            <h2 className="mb-14 text-center font-display text-3xl md:text-4xl">
              Wishi gift card benefits
            </h2>
            <div className="grid gap-10 md:grid-cols-3">
              {benefits.map((b) => (
                <div key={b.title} className="text-center">
                  <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
                    <b.icon className="h-6 w-6 text-foreground" />
                  </div>
                  <h3 className="mb-3 font-display text-lg">{b.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {b.description}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-14 text-center">
              <BuyGiftCardDialog
                isAuthed={isAuthed}
                label="Buy a gift card"
                className="h-11 rounded-full px-8 text-sm"
              />
            </div>
          </div>
        </section>

        {/* Corporate gifting */}
        <section className="bg-background">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-0 md:grid-cols-2">
            <div className="px-8 py-14 md:px-16">
              <h2 className="mb-6 font-display text-3xl italic md:text-4xl">
                Corporate gifting
              </h2>
              <p className="mb-8 max-w-md text-sm leading-relaxed text-muted-foreground">
                Give your team or clients a gift they&apos;ll actually love: a
                Wishi gift card. From workwear to weekend looks, a pro stylist
                curates outfits just for them — thoughtful, effortless, and
                undeniably chic.
              </p>
              <PillButton
                href="https://calendly.com/ninane-wishi/wishi-consultation"
                variant="solid"
                size="md"
              >
                Schedule a call
              </PillButton>
            </div>
            <div className="flex h-[360px] items-center justify-center bg-secondary/40 md:h-[520px]">
              <div className="flex h-[200px] w-[320px] flex-col items-center justify-center rounded-lg bg-background shadow-sm">
                <span className="font-display text-4xl tracking-wide text-foreground/80">
                  wishi
                </span>
                <span className="mt-2 text-xs uppercase tracking-[0.3em] text-foreground/60">
                  Gift card
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="bg-card py-20 md:py-28">
          <div className="mx-auto max-w-5xl px-6">
            <h2 className="mb-14 text-center font-display text-3xl md:text-4xl">
              The Wishi gift card experience
            </h2>
            <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
              <div className="flex justify-center">
                <div className="relative aspect-[3/4] w-full max-w-[340px] overflow-hidden rounded-2xl bg-muted">
                  <Image
                    src="/img/hiw-moodboard.png"
                    alt="Wishi styling experience"
                    fill
                    sizes="(min-width: 768px) 340px, 80vw"
                    className="object-cover"
                  />
                </div>
              </div>
              <div className="space-y-8">
                {steps.map((step) => (
                  <div key={step.num} className="flex gap-5">
                    <span className="shrink-0 font-display text-2xl italic text-muted-foreground">
                      {step.num}
                    </span>
                    <div>
                      <h3 className="mb-1 font-display text-lg">
                        {step.title}
                      </h3>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {step.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-14 text-center">
              <BuyGiftCardDialog
                isAuthed={isAuthed}
                label="Buy a gift card"
                className="h-11 rounded-full px-8 text-sm"
              />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
