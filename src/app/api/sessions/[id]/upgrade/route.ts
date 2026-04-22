import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { createUpgradeCheckout } from "@/lib/payments/session-upgrade.service";
import { resolveAppUrl } from "@/lib/app-url";
import type { PlanType } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    targetPlan?: string;
  } | null;
  const targetPlan = body?.targetPlan as PlanType | undefined;
  if (!targetPlan || !["MAJOR", "LUX"].includes(targetPlan)) {
    return NextResponse.json(
      { error: "targetPlan must be MAJOR or LUX" },
      { status: 400 }
    );
  }

  const appUrl = resolveAppUrl({
    envAppUrl: process.env.APP_URL,
    headers: await headers(),
  });

  try {
    const { id: sessionId } = await params;
    const checkout = await createUpgradeCheckout({
      sessionId,
      userId: user.id,
      targetPlan,
      successUrl: `${appUrl}/sessions/${sessionId}?upgraded=1`,
      cancelUrl: `${appUrl}/sessions/${sessionId}`,
    });
    return NextResponse.json({ url: checkout.url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
