import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPlanPricesForUi } from "@/lib/plans";
import { ProfileForm } from "@/components/profile/profile-form";
import { MembershipCard } from "@/components/billing/membership-card";
import { LoyaltyTierCard } from "@/components/billing/loyalty-tier-card";
import { TrialBanner } from "@/components/billing/trial-banner";
import { PaymentFailureBanner } from "@/components/billing/payment-failure-banner";
import { SettingsCardGrid, type SettingsCard } from "./settings-card-grid";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const [subscription, loyaltyAccount, prices] = await Promise.all([
    prisma.subscription.findFirst({
      where: { userId: user.id },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    prisma.loyaltyAccount.findUnique({ where: { userId: user.id } }),
    getPlanPricesForUi(),
  ]);

  const activeSession = subscription
    ? await prisma.session.findFirst({
        where: {
          subscriptionId: subscription.id,
          status: { in: ["BOOKED", "ACTIVE"] },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      })
    : null;

  const planName =
    subscription?.planType === "MINI"
      ? "Mini"
      : subscription?.planType === "MAJOR"
        ? "Major"
        : "Lux";

  const cards: SettingsCard[] = [
    {
      kind: "expand",
      key: "personal-info",
      title: "Personal info",
      description: "Edit your name, email, phone, and profile picture.",
      iconKey: "user",
      accent: "bg-secondary",
    },
    {
      kind: "expand",
      key: "membership",
      title: "Membership",
      description: "Manage, pause, or cancel your styling plan.",
      iconKey: "crown",
      accent: "bg-warm-beige",
    },
    {
      kind: "expand",
      key: "loyalty",
      title: "Loyalty rewards",
      description: "Track your status and unlock perks as you book more sessions.",
      iconKey: "gift",
      accent: "bg-cream",
    },
    {
      kind: "portal",
      key: "payment",
      title: "Payment method",
      description: "Update your card and download invoices in the Stripe portal.",
      iconKey: "card",
      accent: "bg-secondary",
    },
    {
      kind: "link",
      key: "orders",
      title: "Orders",
      description: "Review every order placed through Wishi.",
      iconKey: "bag",
      accent: "bg-warm-beige",
      href: "/orders",
    },
    {
      kind: "link",
      key: "closet",
      title: "Closet",
      description: "Browse, add, and organise the pieces you already own.",
      iconKey: "shirt",
      accent: "bg-cream",
      href: "/profile",
    },
    {
      kind: "link",
      key: "favorites",
      title: "Favorites",
      description: "Looks, products, and stylists you've saved.",
      iconKey: "heart",
      accent: "bg-secondary",
      href: "/favorites",
    },
  ];

  const panels = {
    "personal-info": (
      <ProfileForm
        user={{
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          avatarUrl: user.avatarUrl,
        }}
      />
    ),
    membership: (
      <MembershipCard
        subscription={
          subscription
            ? {
                id: subscription.id,
                planType: subscription.planType,
                status: subscription.status,
                frequency: subscription.frequency,
                currentPeriodEnd: subscription.currentPeriodEnd,
                pausedUntil: subscription.pausedUntil,
                cancelRequestedAt: subscription.cancelRequestedAt,
                pendingPlanType: subscription.pendingPlanType,
                lastPaymentFailedAt: subscription.lastPaymentFailedAt,
                activeSessionId: activeSession?.id ?? null,
              }
            : null
        }
        miniPriceDollars={prices.mini.displayDollars}
        majorPriceDollars={prices.major.displayDollars}
        luxPriceDollars={prices.lux.displayDollars}
      />
    ),
    loyalty: (
      <LoyaltyTierCard
        tier={loyaltyAccount?.tier ?? user.loyaltyTier}
        lifetimeBookingCount={loyaltyAccount?.lifetimeBookingCount ?? 0}
      />
    ),
  };

  return (
    <>
      {subscription?.status === "TRIALING" ? (
        <TrialBanner
          trialEndsAt={subscription.trialEndsAt}
          planName={planName}
        />
      ) : null}
      {subscription?.status === "PAST_DUE" ? (
        <PaymentFailureBanner subscriptionId={subscription.id} />
      ) : null}

      <div className="min-h-screen bg-background">
        <div className="bg-secondary/40">
          <div className="mx-auto max-w-6xl px-6 md:px-10 py-10 md:py-14">
            <h1 className="font-display text-3xl md:text-5xl text-foreground">
              Settings
            </h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-lg">
              Manage your profile, membership, and the closet you&apos;ve been
              building with Wishi.
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-6 md:px-10 py-8 md:py-12">
          <SettingsCardGrid cards={cards} panels={panels} />
        </div>
      </div>
    </>
  );
}
