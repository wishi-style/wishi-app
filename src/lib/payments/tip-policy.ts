// Tip policy for the end-session flow.
//
// Clients choose from 3 percentage chips (15 / 20 / 25) or a custom amount.
// Chip amounts are computed as a percentage of the plan price — so a Major
// session ($130) shows $19.50 / $26 / $32.50. Custom tips must fall between
// $1 and 100% of the plan price (no effectively-limitless tips from the UI).

export const TIP_CHIP_PERCENTAGES = [15, 20, 25] as const;
export type TipChipPercentage = (typeof TIP_CHIP_PERCENTAGES)[number];

export const MIN_TIP_CENTS = 100;

export type TipChip = {
  percentage: TipChipPercentage;
  amountCents: number;
};

export function computeChipAmounts(planPriceCents: number): TipChip[] {
  return TIP_CHIP_PERCENTAGES.map((percentage) => ({
    percentage,
    amountCents: Math.round((planPriceCents * percentage) / 100),
  }));
}

export function maxTipCents(planPriceCents: number): number {
  return planPriceCents;
}

export type TipValidation =
  | { ok: true; amountCents: number }
  | { ok: false; reason: string };

export function validateTip(
  tipCents: number,
  planPriceCents: number
): TipValidation {
  if (!Number.isFinite(tipCents) || !Number.isInteger(tipCents)) {
    return { ok: false, reason: "Tip must be an integer number of cents" };
  }
  if (tipCents === 0) return { ok: true, amountCents: 0 };
  if (tipCents < MIN_TIP_CENTS) {
    return { ok: false, reason: `Minimum tip is $${MIN_TIP_CENTS / 100}` };
  }
  const max = maxTipCents(planPriceCents);
  if (tipCents > max) {
    return { ok: false, reason: `Tip cannot exceed $${max / 100}` };
  }
  return { ok: true, amountCents: tipCents };
}
