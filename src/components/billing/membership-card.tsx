"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Crown, ExternalLink } from "lucide-react";
import { CancelMembershipDialog } from "./cancel-membership-dialog";
import { UpgradePlanDialog } from "./upgrade-plan-dialog";
import { PaymentFailureBanner } from "./payment-failure-banner";
import type { PlanType, SubscriptionStatus, SubscriptionFrequency } from "@/generated/prisma/client";

export interface MembershipCardSubscription {
  id: string;
  planType: PlanType;
  status: SubscriptionStatus;
  frequency: SubscriptionFrequency;
  currentPeriodEnd: string | Date | null;
  pausedUntil: string | Date | null;
  cancelRequestedAt: string | Date | null;
  pendingPlanType: PlanType | null;
  lastPaymentFailedAt: string | Date | null;
  activeSessionId: string | null;
}

export interface MembershipCardProps {
  subscription: MembershipCardSubscription | null;
  miniPriceDollars: number;
  majorPriceDollars: number;
  luxPriceDollars: number;
}

function formatDate(d: string | Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function planPriceFor(plan: PlanType, m: number, j: number, l: number): number {
  if (plan === "MINI") return m;
  if (plan === "MAJOR") return j;
  return l;
}

function planDisplayName(plan: PlanType): string {
  if (plan === "MINI") return "Mini";
  if (plan === "MAJOR") return "Major";
  return "Lux";
}

export function MembershipCard({
  subscription,
  miniPriceDollars,
  majorPriceDollars,
  luxPriceDollars,
}: MembershipCardProps) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!subscription) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <Crown className="h-5 w-5 text-primary" />
          <div>
            <p className="font-body text-sm font-medium">No active membership</p>
            <p className="font-body text-xs text-muted-foreground">
              Book a session to get started.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const priceDollars = planPriceFor(
    subscription.planType,
    miniPriceDollars,
    majorPriceDollars,
    luxPriceDollars
  );
  const planName = planDisplayName(subscription.planType);
  const frequencyLabel =
    subscription.frequency === "QUARTERLY" ? "quarter" : "month";

  const cadenceSuffix = `/${frequencyLabel}`;

  const statusBadge = (() => {
    if (subscription.status === "PAUSED") return "Paused";
    if (subscription.status === "CANCELLED") return "Cancelled";
    if (subscription.status === "PAST_DUE") return "Payment failed";
    if (subscription.status === "TRIALING") return "Trial";
    return "Active";
  })();

  const pendingNotice = subscription.pendingPlanType
    ? `Switches to ${planDisplayName(subscription.pendingPlanType)} at next cycle`
    : subscription.cancelRequestedAt
      ? `Cancels on ${formatDate(subscription.currentPeriodEnd)}`
      : null;

  const openPortal = () => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/billing/portal-session", { method: "POST" });
        const data = (await res.json().catch(() => ({}))) as {
          url?: string;
          error?: string;
        };
        if (!res.ok || !data.url) throw new Error(data.error ?? "Portal unavailable");
        window.location.href = data.url;
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  const showFailureBanner =
    subscription.status === "PAST_DUE" || subscription.lastPaymentFailedAt;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Crown className="h-5 w-5 text-primary" />
        <div className="flex-1 min-w-0">
          <p className="font-body text-sm font-medium text-foreground">
            {planName} Membership
          </p>
          {pendingNotice ? (
            <p className="font-body text-xs text-muted-foreground">
              {pendingNotice}
            </p>
          ) : null}
        </div>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-body text-secondary-foreground">
          {statusBadge}
        </span>
      </div>

      {showFailureBanner ? (
        <PaymentFailureBanner subscriptionId={subscription.id} compact />
      ) : null}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2">
        <div>
          <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Plan
          </p>
          <p className="font-body text-sm text-foreground">
            {planName} — ${priceDollars}
            {cadenceSuffix}
          </p>
        </div>
        <div>
          <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-1">
            {subscription.status === "PAUSED" ? "Resumes" : "Next billing"}
          </p>
          <p className="font-body text-sm text-foreground">
            {formatDate(subscription.pausedUntil ?? subscription.currentPeriodEnd)}
          </p>
        </div>
        <div>
          <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Billing cadence
          </p>
          <p className="font-body text-sm text-foreground">
            {subscription.frequency === "QUARTERLY" ? "Every 3 months" : "Monthly"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        {subscription.planType !== "LUX" ? (
          <button
            onClick={() => setUpgradeOpen(true)}
            className="rounded-full bg-foreground text-background px-4 py-2 text-sm font-body font-medium hover:bg-foreground/90 transition-colors"
          >
            Upgrade
          </button>
        ) : null}
        <button
          onClick={openPortal}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-body hover:bg-muted disabled:opacity-60 transition-colors"
        >
          Update payment method
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
        {subscription.status !== "CANCELLED" && !subscription.cancelRequestedAt ? (
          <button
            onClick={() => setCancelOpen(true)}
            className="font-body text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 ml-auto"
          >
            Cancel membership
          </button>
        ) : null}
      </div>

      {subscription.activeSessionId ? (
        <UpgradePlanDialog
          sessionId={subscription.activeSessionId}
          currentPlan={subscription.planType}
          majorPriceDollars={majorPriceDollars}
          luxPriceDollars={luxPriceDollars}
          open={upgradeOpen}
          onOpenChange={setUpgradeOpen}
        />
      ) : null}

      <CancelMembershipDialog
        subscriptionId={subscription.id}
        miniPriceDollars={miniPriceDollars}
        canDowngradeToMini={subscription.planType === "MAJOR"}
        canSwitchToQuarterly={subscription.frequency === "MONTHLY"}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
      />
    </div>
  );
}
