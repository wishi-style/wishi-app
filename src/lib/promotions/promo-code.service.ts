import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { writeAudit } from "@/lib/audit/log";
import type {
  PromoCode,
  PromoCodeCreditType,
  PromoCodeDiscountType,
} from "@/generated/prisma/client";

export interface AdminPromoCodeRow {
  id: string;
  code: string;
  creditType: PromoCodeCreditType;
  discountType: PromoCodeDiscountType;
  discountValue: number;
  isActive: boolean;
  usageLimit: number | null;
  usedCount: number;
  expiresAt: Date | null;
  stripeCouponId: string | null;
  createdAt: Date;
}

export async function listPromoCodes(opts?: {
  take?: number;
  creditType?: PromoCodeCreditType;
}): Promise<AdminPromoCodeRow[]> {
  const rows = await prisma.promoCode.findMany({
    where: { creditType: opts?.creditType },
    orderBy: { createdAt: "desc" },
    take: opts?.take ?? 200,
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    creditType: r.creditType,
    discountType: r.discountType,
    discountValue: r.discountValue,
    isActive: r.isActive,
    usageLimit: r.usageLimit,
    usedCount: r.usedCount,
    expiresAt: r.expiresAt,
    stripeCouponId: r.stripeCouponId,
    createdAt: r.createdAt,
  }));
}

export type CreatePromoCodeInput = {
  code?: string;
  creditType: PromoCodeCreditType;
  usageLimit?: number | null;
  expiresAt?: Date | null;
  actorUserId: string;
} & (
  | { discountType: "AMOUNT"; discountValue: number }
  | { discountType: "PERCENT"; discountValue: number }
);

/**
 * Admin-only. SESSION-type promo codes are mirrored into Stripe as a Coupon
 * so Stripe Checkout can apply them natively at the subscription/one-time
 * flow. SHOPPING-type codes are local-only and applied by the Wishi
 * checkout when the cart hits our webhook.
 *
 * `discountType` discriminates the meaning of `discountValue`:
 *   - AMOUNT  → cents off (e.g. 5000 = $50 off, capped at line total by Stripe)
 *   - PERCENT → 1..100 percent off
 */
export async function createPromoCode(
  input: CreatePromoCodeInput,
): Promise<PromoCode> {
  validateDiscount(input.discountType, input.discountValue);

  const rawCode = input.code?.trim().toUpperCase() || `WISHI-${nanoid(8).toUpperCase()}`;
  if (!/^[A-Z0-9-]+$/.test(rawCode)) {
    throw new Error("Code may only contain letters, digits, and hyphens");
  }

  const stripeCouponId =
    input.creditType === "SESSION"
      ? await createStripeCoupon({
          code: rawCode,
          discountType: input.discountType,
          discountValue: input.discountValue,
          usageLimit: input.usageLimit ?? null,
          expiresAt: input.expiresAt ?? null,
        })
      : null;

  try {
    const promo = await prisma.promoCode.create({
      data: {
        code: rawCode,
        creditType: input.creditType,
        discountType: input.discountType,
        discountValue: input.discountValue,
        usageLimit: input.usageLimit ?? null,
        expiresAt: input.expiresAt ?? null,
        stripeCouponId,
        createdByAdminId: input.actorUserId,
      },
    });

    await writeAudit({
      actorUserId: input.actorUserId,
      action: "promo_code.create",
      entityType: "PromoCode",
      entityId: promo.id,
      meta: {
        code: promo.code,
        creditType: promo.creditType,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        stripeCouponId: promo.stripeCouponId,
      },
    });

    return promo;
  } catch (err) {
    // Roll back the Stripe coupon if the DB insert fails so the two stores
    // don't drift (e.g. duplicate-code constraint violation).
    if (stripeCouponId) {
      await stripe.coupons.del(stripeCouponId).catch(() => undefined);
    }
    throw err;
  }
}

export async function deactivatePromoCode(
  promoCodeId: string,
  actorUserId: string,
): Promise<PromoCode> {
  const promo = await prisma.promoCode.update({
    where: { id: promoCodeId },
    data: { isActive: false },
  });

  if (promo.stripeCouponId) {
    // Stripe coupons can't be "paused", so we delete. Past redemptions stay
    // attached to their Payment records for audit.
    await stripe.coupons.del(promo.stripeCouponId).catch((e: unknown) => {
      console.warn("[promo-code] failed to delete Stripe coupon", {
        stripeCouponId: promo.stripeCouponId,
        error: e instanceof Error ? e.message : String(e),
      });
    });
  }

  await writeAudit({
    actorUserId,
    action: "promo_code.deactivate",
    entityType: "PromoCode",
    entityId: promo.id,
    meta: { code: promo.code, creditType: promo.creditType },
  });

  return promo;
}

/**
 * Compute the actual discount in cents for a given base price.
 *   - AMOUNT  → min(discountValue, basePriceInCents) so we never go negative
 *   - PERCENT → Math.floor(basePrice * value / 100). Stripe rounds the same way.
 */
export function computeDiscountInCents(
  discountType: PromoCodeDiscountType,
  discountValue: number,
  basePriceInCents: number,
): number {
  if (basePriceInCents <= 0) return 0;
  if (discountType === "AMOUNT") {
    return Math.min(discountValue, basePriceInCents);
  }
  return Math.floor((basePriceInCents * discountValue) / 100);
}

function validateDiscount(
  discountType: PromoCodeDiscountType,
  discountValue: number,
): void {
  if (!Number.isInteger(discountValue)) {
    throw new Error("discountValue must be an integer");
  }
  if (discountType === "AMOUNT" && discountValue <= 0) {
    throw new Error("AMOUNT discountValue must be a positive integer (cents)");
  }
  if (discountType === "PERCENT" && (discountValue < 1 || discountValue > 100)) {
    throw new Error("PERCENT discountValue must be between 1 and 100");
  }
}

async function createStripeCoupon(input: {
  code: string;
  discountType: PromoCodeDiscountType;
  discountValue: number;
  usageLimit: number | null;
  expiresAt: Date | null;
}): Promise<string> {
  // Mirror the Wishi-side limits into Stripe so a code that's expired or
  // exhausted locally can't still be redeemed on the Stripe Checkout page.
  const coupon = await stripe.coupons.create({
    id: input.code,
    ...(input.discountType === "AMOUNT"
      ? { amount_off: input.discountValue, currency: "usd" }
      : { percent_off: input.discountValue }),
    duration: "once",
    name: input.code,
    ...(input.usageLimit !== null && input.usageLimit > 0
      ? { max_redemptions: input.usageLimit }
      : {}),
    ...(input.expiresAt
      ? { redeem_by: Math.floor(input.expiresAt.getTime() / 1000) }
      : {}),
  });
  return coupon.id;
}
