// GET /api/stylist/onboarding/connect/return
//
// Called by the wizard step-12 page after Stripe redirects back. Reads the
// current Stripe Connect account state and advances the stylist's
// onboardingStatus to match. The authoritative source of `payouts_enabled`
// is the `account.updated` webhook (see payout-webhooks.ts) — this endpoint
// is a "pull" we do in case the webhook hasn't landed yet when the user
// comes back.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { accountIsPayoutReady, retrieveAccount } from "@/lib/stripe-connect";

export const dynamic = "force-dynamic";

export async function GET() {
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
        onboardingStatus: true,
        payoutsEnabled: true,
      },
    });
    if (!profile?.stripeConnectId) {
      return NextResponse.json({ status: "no_account" }, { status: 400 });
    }

    const account = await retrieveAccount(profile.stripeConnectId);
    const ready = accountIsPayoutReady(account);

    // Advance status so the proxy redirect stops bouncing the stylist to the wizard.
    const advance =
      ready &&
      profile.onboardingStatus !== "AWAITING_ELIGIBILITY" &&
      profile.onboardingStatus !== "ELIGIBLE";

    await prisma.stylistProfile.update({
      where: { id: profile.id },
      data: {
        payoutsEnabled: ready,
        ...(advance ? { onboardingStatus: "STRIPE_CONNECTED" } : {}),
      },
    });

    return NextResponse.json({
      status: ready ? "ready" : "pending",
      payoutsEnabled: ready,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[connect/return] failed", err);
    return NextResponse.json({ error: "Connect status check failed" }, { status: 500 });
  }
}
