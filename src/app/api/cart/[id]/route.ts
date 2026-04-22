import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { removeCartItem } from "@/lib/cart/cart.service";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await requireAuth();
  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const { id } = await params;
  await removeCartItem(user.id, id);
  return NextResponse.json({ ok: true });
}
