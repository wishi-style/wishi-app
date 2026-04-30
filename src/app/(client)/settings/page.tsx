import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPlanPricesForUi } from "@/lib/plans";
import { PersonalInfoPanel } from "@/components/settings/personal-info-panel";
import { MembershipCard } from "@/components/billing/membership-card";
import { LoyaltyTierCard } from "@/components/billing/loyalty-tier-card";
import { TrialBanner } from "@/components/billing/trial-banner";
import { PaymentFailureBanner } from "@/components/billing/payment-failure-banner";
import { StyleInfoPanel } from "@/components/settings/style-info-panel";
import { EditPasswordPanel } from "@/components/settings/edit-password-panel";
import { SettingsCardGrid, type SettingsCard } from "./settings-card-grid";
import { DeactivateAccountButton } from "./deactivate-account-button";

export const dynamic = "force-dynamic";

function formatLocation(loc: { city: string | null; state: string | null } | null) {
  if (!loc) return "";
  if (loc.city && loc.state) return `${loc.city}, ${loc.state}`;
  return loc.city ?? loc.state ?? "";
}

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const [
    subscription,
    loyaltyAccount,
    prices,
    bodyProfile,
    styleProfile,
    primaryLocation,
    socialLinks,
  ] = await Promise.all([
    prisma.subscription.findFirst({
      where: { userId: user.id },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    prisma.loyaltyAccount.findUnique({ where: { userId: user.id } }),
    getPlanPricesForUi(),
    prisma.bodyProfile.findUnique({
      where: { userId: user.id },
      select: { height: true, bodyType: true },
    }),
    prisma.styleProfile.findUnique({
      where: { userId: user.id },
      select: { occupation: true },
    }),
    prisma.userLocation.findFirst({
      where: { userId: user.id, isPrimary: true },
      select: { city: true, state: true },
    }),
    prisma.userSocialLink.findMany({
      where: { userId: user.id, platform: { in: ["instagram", "pinterest"] } },
      select: { platform: true, url: true },
    }),
  ]);

  const instagram = socialLinks.find((l) => l.platform === "instagram")?.url ?? "";
  const pinterest = socialLinks.find((l) => l.platform === "pinterest")?.url ?? "";

  const personalInfo = {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone ?? "",
    birthday: user.birthday
      ? user.birthday.toISOString().slice(0, 10)
      : "",
    location: formatLocation(primaryLocation),
    gender: user.gender ?? "",
    height: bodyProfile?.height ?? "",
    bodyType: bodyProfile?.bodyType ?? "",
    occupation: styleProfile?.occupation ?? "",
    instagram,
    pinterest,
  };

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
      description: "Edit your personal and contact information.",
      iconKey: "user",
      accent: "bg-secondary",
    },
    {
      kind: "expand",
      key: "style-info",
      title: "Style info",
      description: "Edit your size, budget, styling preferences, fashion preferences etc.",
      iconKey: "palette",
      accent: "bg-cream",
    },
    {
      kind: "portal",
      key: "payment",
      title: "Payment method",
      description: "Edit your payment method.",
      iconKey: "card",
      accent: "bg-warm-beige",
    },
    {
      kind: "expand",
      key: "membership",
      title: "Membership",
      description: "Manage, cancel, activate your membership.",
      iconKey: "crown",
      accent: "bg-secondary",
    },
    {
      kind: "link",
      key: "orders",
      title: "Orders",
      description: "Review all your orders here.",
      iconKey: "bag",
      accent: "bg-cream",
      href: "/orders",
    },
    {
      kind: "portal",
      key: "payment-history",
      title: "Payment history",
      description: "Review all your sessions payments here.",
      iconKey: "receipt",
      accent: "bg-warm-beige",
    },
    {
      kind: "expand",
      key: "edit-password",
      title: "Edit password",
      description: "Edit your password here.",
      iconKey: "lock",
      accent: "bg-secondary",
    },
    {
      kind: "expand",
      key: "loyalty",
      title: "Loyalty rewards",
      description: "Review your loyalty rewards.",
      iconKey: "gift",
      accent: "bg-cream",
    },
  ];

  const panels = {
    "personal-info": (
      <PersonalInfoPanel
        avatarUrl={user.avatarUrl}
        initial={personalInfo}
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
    "style-info": <StyleInfoPanel userId={user.id} />,
    "edit-password": <EditPasswordPanel />,
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
              Manage your profile, style preferences, membership and more.
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-6 md:px-10 py-8 md:py-12">
          <SettingsCardGrid cards={cards} panels={panels} />
          <DeactivateAccountButton />
        </div>
      </div>
    </>
  );
}
