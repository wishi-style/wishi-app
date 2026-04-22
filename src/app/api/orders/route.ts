import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listClientOrders } from "@/lib/orders/client-orders.service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { userId: clerkId } = await requireAuth();
  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const takeRaw = url.searchParams.get("take");
  const take = takeRaw ? Number.parseInt(takeRaw, 10) : 20;

  const result = await listClientOrders(user.id, {
    cursor,
    take: Number.isFinite(take) && take > 0 ? take : 20,
  });
  return NextResponse.json(result);
}
