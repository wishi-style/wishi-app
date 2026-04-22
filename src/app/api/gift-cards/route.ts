import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { createGiftCardCheckout } from "@/lib/promotions/gift-card.service";
import { resolveAppUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

interface Body {
  amountInCents?: number;
  recipientEmail?: string;
  recipientName?: string;
  message?: string;
}

export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.amountInCents || !body.recipientEmail) {
    return NextResponse.json(
      { error: "amountInCents and recipientEmail are required" },
      { status: 400 },
    );
  }

  const appUrl = resolveAppUrl({
    envAppUrl: process.env.APP_URL,
    headers: await headers(),
  });

  try {
    const checkout = await createGiftCardCheckout({
      purchaserUserId: user.id,
      amountInCents: body.amountInCents,
      recipientEmail: body.recipientEmail,
      recipientName: body.recipientName,
      message: body.message,
      successUrl: `${appUrl}/gift-cards?success=1`,
      cancelUrl: `${appUrl}/gift-cards`,
    });
    return NextResponse.json({ url: checkout.url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
