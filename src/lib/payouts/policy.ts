// Payout policy for Phase 6. Decides:
//   1. Does a payout fire for this (plan, trigger)?
//   2. How much goes to the stylist in cents?
//
// Rules from WISHI-REBUILD-PLAN.md § Phase 6 items 13–14:
//   PLATFORM Mini/Major: one Stripe Transfer = 70% of plan price + full tip
//     on SESSION_COMPLETED trigger.
//   PLATFORM Lux: two transfers —
//     LUX_THIRD_LOOK (fires when styleboardsSent hits Plan.luxMilestoneLookNumber)
//       = Plan.luxMilestoneAmountCents (default $135)
//     LUX_FINAL (fires on approveEnd)
//       = (70% × Plan.priceInCents) - Plan.luxMilestoneAmountCents + tip
//   IN_HOUSE stylists: same rows are written but with status=SKIPPED; no Stripe call.

import type {
  PayoutTrigger,
  Plan,
  Session,
  StylistProfile,
} from "@/generated/prisma/client";

export type PayoutAmount = {
  amountCents: number;
  tipCents: number;
};

type PolicyInput = {
  plan: Pick<
    Plan,
    "priceInCents" | "payoutTrigger" | "luxMilestoneAmountCents" | "luxMilestoneLookNumber"
  >;
  session: Pick<Session, "tipInCents">;
  stylist: Pick<StylistProfile, "payoutPercentage">;
  trigger: PayoutTrigger;
};

export function computePayoutAmount(input: PolicyInput): PayoutAmount {
  const { plan, session, stylist, trigger } = input;
  const tipCents = session.tipInCents ?? 0;
  const stylistShare = Math.round((plan.priceInCents * stylist.payoutPercentage) / 100);

  switch (trigger) {
    case "SESSION_COMPLETED":
      // Mini/Major: full 70% + tip
      return { amountCents: stylistShare + tipCents, tipCents };

    case "LUX_THIRD_LOOK": {
      // Lux milestone transfer — a flat amount from Plan, no tip here.
      const milestone = plan.luxMilestoneAmountCents ?? 0;
      return { amountCents: milestone, tipCents: 0 };
    }

    case "LUX_FINAL": {
      // Remainder of the 70% after the milestone, plus tip.
      const milestone = plan.luxMilestoneAmountCents ?? 0;
      return { amountCents: stylistShare - milestone + tipCents, tipCents };
    }
  }
}

// Which trigger fires on session completion for a given plan.
export function completionTriggerFor(plan: Pick<Plan, "payoutTrigger">): PayoutTrigger {
  // Plan.payoutTrigger is "SESSION_COMPLETED" for Mini/Major and "LUX_THIRD_LOOK" for Lux
  // (see prisma/seeds/plans.ts). We use it as a Lux flag, not as the completion trigger.
  return plan.payoutTrigger === "SESSION_COMPLETED" ? "SESSION_COMPLETED" : "LUX_FINAL";
}

export function isLuxPlan(plan: Pick<Plan, "payoutTrigger">): boolean {
  return plan.payoutTrigger !== "SESSION_COMPLETED";
}
