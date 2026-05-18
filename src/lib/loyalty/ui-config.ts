import { Crown, Star, Sparkles } from "lucide-react";
import type { ViewLoyaltyTier } from "@/lib/stylists/client-profile";

// UI badge config for the 5-level display tier (new / bronze / silver / gold /
// vip) surfaced on the stylist's ClientDetailPanel and builder chrome. This is
// the *display* tier — distinct from the DB-side `LoyaltyTier` enum
// (BRONZE / GOLD / PLATINUM) that powers loyalty math in `lib/loyalty/service.ts`.
export const loyaltyConfig: Record<
  ViewLoyaltyTier,
  { label: string; icon: React.ElementType; className: string }
> = {
  new: {
    label: "New Client",
    icon: Sparkles,
    className: "text-foreground bg-muted",
  },
  bronze: {
    label: "Bronze",
    icon: Star,
    className: "text-amber-800 bg-amber-100",
  },
  silver: {
    label: "Silver",
    icon: Star,
    className: "text-slate-500 bg-slate-100",
  },
  gold: {
    label: "Gold",
    icon: Crown,
    className: "text-amber-600 bg-amber-50",
  },
  vip: {
    label: "VIP",
    icon: Crown,
    className: "text-accent bg-accent/10",
  },
};
