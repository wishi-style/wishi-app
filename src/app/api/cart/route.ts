import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addCartItem, listCartItems } from "@/lib/cart/cart.service";

export const dynamic = "force-dynamic";

const AddCartBody = z.object({
  inventoryProductId: z.string().min(1),
  sessionId: z.string().min(1),
  quantity: z.number().int().min(1).max(50).optional(),
});

export async function GET(req: Request) {
  const { userId: clerkId } = await requireAuth();
  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId") ?? undefined;
  const items = await listCartItems(user.id, sessionId);
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const { userId: clerkId } = await requireAuth();
  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const parsed = AddCartBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const item = await addCartItem({
      userId: user.id,
      inventoryProductId: parsed.data.inventoryProductId,
      sessionId: parsed.data.sessionId,
      quantity: parsed.data.quantity ?? 1,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Add to cart failed" },
      { status: 400 },
    );
  }
}
