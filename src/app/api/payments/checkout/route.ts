import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createDirectSaleCheckout } from "@/lib/payments/direct-sale.service";
import { resolveAppUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

const Body = z.object({
  cartItemIds: z.array(z.string().min(1)).min(1).max(50),
  successPath: z.string().startsWith("/").optional(),
  cancelPath: z.string().startsWith("/").optional(),
});

export async function POST(req: Request) {
  const { userId: clerkId } = await requireAuth();
  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const appUrl = resolveAppUrl({
    envAppUrl: process.env.APP_URL,
    headers: req.headers,
  });

  try {
    const session = await createDirectSaleCheckout({
      userId: user.id,
      cartItemIds: parsed.data.cartItemIds,
      successUrl: `${appUrl}${parsed.data.successPath ?? "/orders?checkout=success"}`,
      cancelUrl: `${appUrl}${parsed.data.cancelPath ?? "/orders?checkout=cancelled"}`,
    });
    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Checkout failed" },
      { status: 400 },
    );
  }
}
