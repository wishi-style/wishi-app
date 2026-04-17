// GET /api/payments/payouts
//
// Lists the current stylist's payouts, newest first. Scoped by the caller's
// stylistProfile so a stylist can never see another stylist's rows.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole("STYLIST");
    const user = await getCurrentAuthUser();
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const profile = await prisma.stylistProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!profile) return NextResponse.json({ payouts: [] });

    const payouts = await prisma.payout.findMany({
      where: { stylistProfileId: profile.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        trigger: true,
        amountInCents: true,
        tipInCents: true,
        currency: true,
        status: true,
        stripeTransferId: true,
        skippedReason: true,
        triggeredAt: true,
        reconciledAt: true,
        sessionId: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ payouts });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[payouts/list] failed", err);
    return NextResponse.json({ error: "Failed to list payouts" }, { status: 500 });
  }
}
