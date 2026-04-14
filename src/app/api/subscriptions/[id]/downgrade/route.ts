import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { downgradeSubscription } from "@/lib/payments/subscription-actions";
import type { PlanType } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { clerkId }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const body = await req.json();
  const newPlanType = body.planType as PlanType;
  if (!newPlanType || !["MINI", "MAJOR"].includes(newPlanType)) {
    return NextResponse.json({ error: "Invalid plan type" }, { status: 400 });
  }

  try {
    const { id } = await params;
    await downgradeSubscription(id, user.id, newPlanType);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
