import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createPromoCode } from "@/lib/promotions/promo-code.service";
import type {
  PromoCodeCreditType,
  PromoCodeDiscountType,
} from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

interface Body {
  code?: string;
  creditType?: PromoCodeCreditType;
  discountType?: PromoCodeDiscountType;
  discountValue?: number;
  usageLimit?: number | null;
  expiresAt?: string | null;
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  const body = (await req.json().catch(() => null)) as Body | null;
  if (
    !body?.creditType ||
    !body?.discountType ||
    typeof body?.discountValue !== "number"
  ) {
    return NextResponse.json(
      { error: "creditType, discountType, and discountValue are required" },
      { status: 400 },
    );
  }
  try {
    const promo = await createPromoCode({
      code: body.code,
      creditType: body.creditType,
      discountType: body.discountType,
      discountValue: body.discountValue,
      usageLimit: body.usageLimit ?? null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      actorUserId: admin.userId,
    });
    return NextResponse.json({ ok: true, id: promo.id, code: promo.code });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Create failed" },
      { status: 400 },
    );
  }
}
