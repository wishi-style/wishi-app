import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { createBuyMoreLooksCheckout } from "@/lib/payments/buy-more-looks.service";
import { resolveAppUrl } from "@/lib/app-url";

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

  const body = (await req.json().catch(() => null)) as { quantity?: number } | null;
  const quantity = Number(body?.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    return NextResponse.json(
      { error: "quantity must be a positive integer" },
      { status: 400 }
    );
  }

  const appUrl = resolveAppUrl({
    envAppUrl: process.env.APP_URL,
    headers: await headers(),
  });

  try {
    const { id: sessionId } = await params;
    const checkout = await createBuyMoreLooksCheckout({
      sessionId,
      userId: user.id,
      quantity,
      successUrl: `${appUrl}/sessions/${sessionId}?boardsAdded=${quantity}`,
      cancelUrl: `${appUrl}/sessions/${sessionId}`,
    });
    return NextResponse.json({ url: checkout.url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
