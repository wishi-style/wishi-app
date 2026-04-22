import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { deactivatePromoCode } from "@/lib/promotions/promo-code.service";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  const { id } = await params;
  try {
    await deactivatePromoCode(id, admin.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Deactivate failed" },
      { status: 400 },
    );
  }
}
