// POST /api/stylist/onboarding/connect/start
//
// Creates a Stripe Connect Express account for the current stylist if they
// don't have one yet, then returns a fresh onboarding AccountLink URL.
// The client redirects to that URL; Stripe bounces back to /onboarding/step-12
// where the return endpoint picks up.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { createAccountLink, createExpressAccount } from "@/lib/stripe-connect";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireRole("STYLIST");
    const user = await getCurrentAuthUser();
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const profile = await prisma.stylistProfile.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        stripeConnectId: true,
        stylistType: true,
        user: { select: { email: true } },
      },
    });
    if (!profile) {
      return NextResponse.json({ error: "Stylist profile not found" }, { status: 404 });
    }
    if (profile.stylistType === "IN_HOUSE") {
      return NextResponse.json(
        { error: "In-house stylists do not need Stripe Connect" },
        { status: 400 }
      );
    }

    let accountId = profile.stripeConnectId;
    if (!accountId) {
      const account = await createExpressAccount({
        email: profile.user.email,
        stylistProfileId: profile.id,
      });
      accountId = account.id;
      await prisma.stylistProfile.update({
        where: { id: profile.id },
        data: { stripeConnectId: accountId },
      });
    }

    const origin = new URL(req.url).origin;
    const link = await createAccountLink({
      accountId,
      refreshUrl: `${origin}/onboarding/step-12?status=refresh`,
      returnUrl: `${origin}/onboarding/step-12?status=complete`,
    });

    return NextResponse.json({ url: link.url });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[connect/start] failed", err);
    return NextResponse.json({ error: "Connect onboarding failed to start" }, { status: 500 });
  }
}
