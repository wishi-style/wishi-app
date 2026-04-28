import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateDirectSaleTax } from "@/lib/payments/direct-sale-elements.service";

export const dynamic = "force-dynamic";

// US-only at launch (matches the Hosted-side
// `shipping_address_collection.allowed_countries: ["US"]`).
const Body = z.object({
  cartItemIds: z.array(z.string().min(1)).min(1).max(50),
  address: z.object({
    name: z.string().min(1).max(200),
    line1: z.string().min(1).max(200),
    line2: z.string().max(200).optional().nullable(),
    city: z.string().min(1).max(100),
    state: z.string().length(2),
    postalCode: z.string().min(3).max(20),
    country: z.literal("US"),
  }),
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

  try {
    const quote = await calculateDirectSaleTax({
      userId: user.id,
      cartItemIds: parsed.data.cartItemIds,
      address: parsed.data.address,
    });
    return NextResponse.json(quote);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Tax calculation failed" },
      { status: 400 },
    );
  }
}
