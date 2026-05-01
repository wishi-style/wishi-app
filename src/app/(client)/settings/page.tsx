import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPlanPricesForUi } from "@/lib/plans";
import { PersonalInfoPanel } from "@/components/settings/personal-info-panel";
import { MembershipCard } from "@/components/billing/membership-card";
import { LoyaltyTierCard } from "@/components/billing/loyalty-tier-card";
import { TrialBanner } from "@/components/billing/trial-banner";
import { PaymentFailureBanner } from "@/components/billing/payment-failure-banner";
import {
  StyleInfoPanel,
  type StyleInfo,
} from "@/components/settings/style-info-panel";
import { EditPasswordPanel } from "@/components/settings/edit-password-panel";
import { SettingsCardGrid, type SettingsCard } from "./settings-card-grid";
import { DeactivateAccountButton } from "./deactivate-account-button";

export const dynamic = "force-dynamic";

function formatLocation(loc: { city: string | null; state: string | null } | null) {
  if (!loc) return "";
  if (loc.city && loc.state) return `${loc.city}, ${loc.state}`;
  return loc.city ?? loc.state ?? "";
}

function formatBudget(min: number, max: number): string {
  return `$${Math.round(min / 100)}–${Math.round(max / 100)}`;
}

function comfortZoneLabel(level: number | null | undefined): string {
  if (level === null || level === undefined) return "";
  if (level <= 3) return "Stay close";
  if (level <= 7) return "A little outside";
  return "Push my boundaries";
}

const FIT_DISPLAY: Record<string, string> = {
  SLIM: "Slim",
  REGULAR: "Regular",
  RELAXED: "Relaxed",
  OVERSIZED: "Oversized",
};

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
    budgets,
    colors,
    fabrics,
    patterns,
    latestSession,
  ] = await Promise.all([
    prisma.subscription.findFirst({
      where: { userId: user.id },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    prisma.loyaltyAccount.findUnique({ where: { userId: user.id } }),
    getPlanPricesForUi(),
    prisma.bodyProfile.findUnique({
      where: { userId: user.id },
      include: { sizes: true },
    }),
    prisma.styleProfile.findUnique({ where: { userId: user.id } }),
    prisma.userLocation.findFirst({
      where: { userId: user.id, isPrimary: true },
      select: { city: true, state: true },
    }),
    prisma.userSocialLink.findMany({
      where: { userId: user.id, platform: { in: ["instagram", "pinterest"] } },
      select: { platform: true, url: true },
    }),
    prisma.budgetByCategory.findMany({ where: { userId: user.id } }),
    prisma.colorPreference.findMany({ where: { userId: user.id } }),
    prisma.fabricPreference.findMany({ where: { userId: user.id } }),
    prisma.patternPreference.findMany({ where: { userId: user.id } }),
    prisma.session.findFirst({
      where: { clientId: user.id },
      select: { id: true },
      orderBy: { createdAt: "desc" },
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

  const sizeByCategory = new Map(
    (bodyProfile?.sizes ?? []).map((s) => [s.category.toUpperCase(), s.size]),
  );
  const budgetByCategory = new Map(budgets.map((b) => [b.category, b]));

  const styleInfo: StyleInfo = {
    shoppingFor: styleProfile?.needsDescription ?? "",
    workEnvironment: styleProfile?.dressCode ?? "",
    occupation: styleProfile?.occupation ?? "",
    location: formatLocation(primaryLocation),
    piecesNeeded: (styleProfile?.piecesNeeded ?? []).join(", "),
    height: bodyProfile?.height ?? "",
    bodyType: bodyProfile?.bodyType ?? "",
    fitTops: bodyProfile?.topFit ? FIT_DISPLAY[bodyProfile.topFit] ?? "" : "",
    fitBottoms: bodyProfile?.bottomFit
      ? FIT_DISPLAY[bodyProfile.bottomFit] ?? ""
      : "",
    tendToWear: styleProfile?.typicallyWears ?? "",
    accentuate: (bodyProfile?.highlightAreas ?? []).join(", "),
    necklinesAvoid: (bodyProfile?.necklinesAvoid ?? []).join(", "),
    bodyAreasMindful: (bodyProfile?.bodyAreasMindful ?? []).join(", "),
    bodyAreasNotes: bodyProfile?.bodyIssues ?? "",
    topSize: sizeByCategory.get("TOPS") ?? "",
    bottomSize: sizeByCategory.get("BOTTOMS") ?? "",
    jeansSize: sizeByCategory.get("JEANS") ?? "",
    dressSize: sizeByCategory.get("DRESSES") ?? "",
    outerwearSize: sizeByCategory.get("OUTERWEAR") ?? "",
    shoeSize: sizeByCategory.get("SHOES") ?? "",
    budgetTops: budgetByCategory.has("TOPS")
      ? formatBudget(budgetByCategory.get("TOPS")!.minInCents, budgetByCategory.get("TOPS")!.maxInCents)
      : "",
    budgetBottoms: budgetByCategory.has("BOTTOMS")
      ? formatBudget(budgetByCategory.get("BOTTOMS")!.minInCents, budgetByCategory.get("BOTTOMS")!.maxInCents)
      : "",
    budgetShoes: budgetByCategory.has("SHOES")
      ? formatBudget(budgetByCategory.get("SHOES")!.minInCents, budgetByCategory.get("SHOES")!.maxInCents)
      : "",
    budgetJewelry: budgetByCategory.has("JEWELRY")
      ? formatBudget(budgetByCategory.get("JEWELRY")!.minInCents, budgetByCategory.get("JEWELRY")!.maxInCents)
      : "",
    budgetAccessories: budgetByCategory.has("ACCESSORIES")
      ? formatBudget(
          budgetByCategory.get("ACCESSORIES")!.minInCents,
          budgetByCategory.get("ACCESSORIES")!.maxInCents,
        )
      : "",
    styleKeywords: (styleProfile?.stylePreferences ?? []).join(", "),
    favoriteColors: colors.filter((c) => c.isLiked).map((c) => c.color).join(", "),
    avoidColors: colors.filter((c) => !c.isLiked).map((c) => c.color).join(", "),
    favoritePatterns: patterns
      .filter((p) => !p.isDisliked)
      .map((p) => p.pattern)
      .join(", "),
    materialsAvoid: fabrics
      .filter((f) => f.isDisliked)
      .map((f) => f.fabric)
      .join(", "),
    comfortZone: comfortZoneLabel(styleProfile?.comfortZoneLevel),
    shoppingValues: (styleProfile?.shoppingValues ?? []).join(", "),
    styleIcons: (styleProfile?.styleIcons ?? []).join(", "),
    instagram,
    pinterest,
    preferredBrands: (styleProfile?.preferredBrands ?? []).join(", "),
    avoidBrands: (styleProfile?.avoidBrands ?? []).join(", "),
    occasions: (styleProfile?.occasions ?? []).join(", "),
    notes: styleProfile?.notes ?? "",
  };

  const retakeHref = latestSession
    ? `/sessions/${latestSession.id}/style-quiz`
    : "/sessions";

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
    "style-info": <StyleInfoPanel initial={styleInfo} retakeHref={retakeHref} />,
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
