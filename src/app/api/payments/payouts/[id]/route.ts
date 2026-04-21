// GET /api/payments/payouts/[id]
//
// Returns a single Payout detail with session context. Scoped to the
// caller's stylistProfile.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("STYLIST");
    const user = await getCurrentAuthUser();
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const profile = await prisma.stylistProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

    const { id } = await context.params;
    const payout = await prisma.payout.findFirst({
      where: { id, stylistProfileId: profile.id },
      include: {
        session: {
          select: {
            id: true,
            planType: true,
            tipInCents: true,
            completedAt: true,
            client: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!payout) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ payout });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[payouts/detail] failed", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
