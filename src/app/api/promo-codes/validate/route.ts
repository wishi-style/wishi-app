import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeDiscountInCents } from "@/lib/promotions/promo-code.service";
import type { PromoCodeCreditType } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

interface Body {
  code?: string;
  creditType?: PromoCodeCreditType;
  basePriceInCents?: number;
}

/**
 * Validates a promo code without consuming it. Returns the computed discount
 * in cents for the supplied base price so the order summary can render the
 * post-discount total. Usage is only incremented in the post-Stripe webhook
 * (see redeemPromoCode in lib/promotions/gift-card.service.ts).
 *
 * Intentionally unauthenticated — codes themselves are the auth boundary.
 * `usedCount` is read but not mutated, so probe attempts can't burn usage.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.code || !body?.creditType || typeof body.basePriceInCents !== "number") {
    return NextResponse.json(
      { valid: false, reason: "Missing code, creditType, or basePriceInCents" },
      { status: 400 },
    );
  }

  const code = body.code.trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ valid: false, reason: "Empty code" });
  }

  const promo = await prisma.promoCode.findUnique({ where: { code } });
  if (!promo) {
    return NextResponse.json({ valid: false, reason: "Code not found" });
  }
  if (!promo.isActive) {
    return NextResponse.json({ valid: false, reason: "Code inactive" });
  }
  if (promo.creditType !== body.creditType) {
    return NextResponse.json({
      valid: false,
      reason: `Code is for ${promo.creditType.toLowerCase()} checkout`,
    });
  }
  if (promo.expiresAt && promo.expiresAt < new Date()) {
    return NextResponse.json({ valid: false, reason: "Code expired" });
  }
  if (promo.usageLimit !== null && promo.usedCount >= promo.usageLimit) {
    return NextResponse.json({ valid: false, reason: "Code fully redeemed" });
  }

  const discountInCents = computeDiscountInCents(
    promo.discountType,
    promo.discountValue,
    body.basePriceInCents,
  );

  return NextResponse.json({
    valid: true,
    code: promo.code,
    discountType: promo.discountType,
    discountValue: promo.discountValue,
    discountInCents,
  });
}
