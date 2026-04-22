import { Gift } from "lucide-react";
import type { LoyaltyTier } from "@/generated/prisma/client";

export interface LoyaltyTierCardProps {
  tier: LoyaltyTier;
  lifetimeBookingCount: number;
}

const THRESHOLDS: Record<LoyaltyTier, { min: number; next: LoyaltyTier | null; nextMin: number | null }> = {
  BRONZE: { min: 0, next: "GOLD", nextMin: 3 },
  GOLD: { min: 3, next: "PLATINUM", nextMin: 8 },
  PLATINUM: { min: 8, next: null, nextMin: null },
};

function tierLabel(tier: LoyaltyTier): string {
  return tier.charAt(0) + tier.slice(1).toLowerCase();
}

export function LoyaltyTierCard({
  tier,
  lifetimeBookingCount,
}: LoyaltyTierCardProps) {
  const t = THRESHOLDS[tier];
  const remaining =
    t.nextMin !== null ? Math.max(0, t.nextMin - lifetimeBookingCount) : 0;
  const progressLabel = t.next
    ? `${lifetimeBookingCount} of ${t.nextMin} bookings to ${tierLabel(t.next)}`
    : "You've reached the top tier.";

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-3 mb-4">
        <Gift className="h-5 w-5 text-primary" />
        <div>
          <p className="font-body text-sm font-medium text-foreground">Loyalty rewards</p>
          <p className="font-body text-xs text-muted-foreground">
            Current tier: <span className="font-medium">{tierLabel(tier)}</span>
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="font-body text-sm text-foreground">{progressLabel}</p>
        {t.next ? (
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: `${Math.min(100, (lifetimeBookingCount / (t.nextMin ?? 1)) * 100)}%`,
              }}
            />
          </div>
        ) : null}
        {t.next && remaining > 0 ? (
          <p className="font-body text-xs text-muted-foreground">
            {remaining} more booking{remaining === 1 ? "" : "s"} to {tierLabel(t.next)}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
