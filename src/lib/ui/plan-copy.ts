/**
 * UI-only marketing copy for the three plan tiers.
 * Prices come from the Plan table via `getPlanPricesForUi()` — never hardcoded.
 *
 * Locked 2026-04-08:
 * - Lux is 8 flat styleboards (capsules dropped entirely).
 * - Lux "virtual fitting room" = the included 30-min stylist video call (no
 *   platform instrumentation).
 */

export type PlanTier = "MINI" | "MAJOR" | "LUX";

export type PlanCopy = {
  tier: PlanTier;
  name: string;
  tagline: string;
  bullets: string[];
  ctaLabel: string;
  trialLabel?: string;
};

export const planCopy: Record<PlanTier, PlanCopy> = {
  MINI: {
    tier: "MINI",
    name: "Mini",
    tagline: "A quick style refresh for a single moment.",
    bullets: [
      "1 moodboard to align on your taste",
      "2 curated styleboards",
      "Chat with your stylist through the session",
      "Buy additional looks at any time",
    ],
    ctaLabel: "Start your Mini",
    trialLabel: "3-day trial",
  },
  MAJOR: {
    tier: "MAJOR",
    name: "Major",
    tagline: "A full wardrobe reset with ongoing styling.",
    bullets: [
      "1 moodboard to align on your taste",
      "5 curated styleboards",
      "Ongoing access to your stylist",
      "Cancel, pause, or downgrade any time",
    ],
    ctaLabel: "Start your Major",
    trialLabel: "3-day trial",
  },
  LUX: {
    tier: "LUX",
    name: "Lux",
    tagline: "The ultimate styling experience, end to end.",
    bullets: [
      "1 moodboard to align on your taste",
      "8 curated styleboards",
      "A 30-minute one-on-one video call with your stylist",
      "Concierge Wishi fulfillment for items bought through Wishi",
      "Priority in-session support",
    ],
    ctaLabel: "Start your Lux",
  },
} as const;

export const planTierOrder: PlanTier[] = ["MINI", "MAJOR", "LUX"];
