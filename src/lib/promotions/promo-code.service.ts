import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { writeAudit } from "@/lib/audit/log";
import type { PromoCode, PromoCodeCreditType } from "@/generated/prisma/client";

export interface AdminPromoCodeRow {
  id: string;
  code: string;
  creditType: PromoCodeCreditType;
  amountInCents: number;
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
    amountInCents: r.amountInCents,
    isActive: r.isActive,
    usageLimit: r.usageLimit,
    usedCount: r.usedCount,
    expiresAt: r.expiresAt,
    stripeCouponId: r.stripeCouponId,
    createdAt: r.createdAt,
  }));
}

export interface CreatePromoCodeInput {
  code?: string;
  creditType: PromoCodeCreditType;
  amountInCents: number;
  usageLimit?: number | null;
  expiresAt?: Date | null;
  actorUserId: string;
}

/**
 * Admin-only. SESSION-type promo codes are mirrored into Stripe as a Coupon
 * so Stripe Checkout can apply them natively at the subscription/one-time
 * flow. SHOPPING-type codes are local-only and applied by the Wishi
 * checkout when the cart hits our webhook.
 */
export async function createPromoCode(
  input: CreatePromoCodeInput,
): Promise<PromoCode> {
  if (!Number.isInteger(input.amountInCents) || input.amountInCents <= 0) {
    throw new Error("amountInCents must be a positive integer");
  }
  const rawCode = input.code?.trim().toUpperCase() || `WISHI-${nanoid(8).toUpperCase()}`;
  if (!/^[A-Z0-9-]+$/.test(rawCode)) {
    throw new Error("Code may only contain letters, digits, and hyphens");
  }

  const stripeCouponId =
    input.creditType === "SESSION"
      ? await createStripeCoupon({
          code: rawCode,
          amountInCents: input.amountInCents,
          usageLimit: input.usageLimit ?? null,
          expiresAt: input.expiresAt ?? null,
        })
      : null;

  try {
    const promo = await prisma.promoCode.create({
      data: {
        code: rawCode,
        creditType: input.creditType,
        amountInCents: input.amountInCents,
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
        amountInCents: promo.amountInCents,
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

async function createStripeCoupon(input: {
  code: string;
  amountInCents: number;
  usageLimit: number | null;
  expiresAt: Date | null;
}): Promise<string> {
  // Mirror the Wishi-side limits into Stripe so a code that's expired or
  // exhausted locally can't still be redeemed on the Stripe Checkout page.
  const coupon = await stripe.coupons.create({
    id: input.code,
    amount_off: input.amountInCents,
    currency: "usd",
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
