import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPlanPricesForUi } from "@/lib/plans";
import { ProfileForm } from "@/components/profile/profile-form";
import { MembershipCard } from "@/components/billing/membership-card";
import { LoyaltyTierCard } from "@/components/billing/loyalty-tier-card";
import { TrialBanner } from "@/components/billing/trial-banner";
import { PaymentFailureBanner } from "@/components/billing/payment-failure-banner";

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
        <div className="mx-auto max-w-2xl px-6 md:px-10 py-12 md:py-16 space-y-10">
          <header>
            <h1 className="font-display text-3xl md:text-4xl">Settings</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Manage your profile, membership, and preferences.
            </p>
          </header>

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

          <LoyaltyTierCard
            tier={loyaltyAccount?.tier ?? user.loyaltyTier}
            lifetimeBookingCount={loyaltyAccount?.lifetimeBookingCount ?? 0}
          />

          <section>
            <h2 className="font-display text-xl md:text-2xl mb-4">
              Personal info
            </h2>
            <ProfileForm
              user={{
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone,
                avatarUrl: user.avatarUrl,
              }}
            />
          </section>
        </div>
      </div>
    </>
  );
}
