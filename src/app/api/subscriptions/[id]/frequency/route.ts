import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { switchSubscriptionFrequency } from "@/lib/payments/subscription-actions";
import type { SubscriptionFrequency } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { clerkId }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { frequency?: string } | null;
  const frequency = body?.frequency as SubscriptionFrequency | undefined;
  if (!frequency || !["MONTHLY", "QUARTERLY"].includes(frequency)) {
    return NextResponse.json(
      { error: "frequency must be MONTHLY or QUARTERLY" },
      { status: 400 }
    );
  }

  try {
    const { id } = await params;
    const result = await switchSubscriptionFrequency(id, user.id, frequency);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
