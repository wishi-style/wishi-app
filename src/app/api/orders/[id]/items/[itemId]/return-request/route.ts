import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit/log";
import { requestRetailerReturnForOrderItem } from "@/lib/orders/client-orders.service";

export const dynamic = "force-dynamic";

const Body = z.object({
  receiptRef: z.string().trim().min(1).max(500),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { userId: clerkId } = await requireAuth();
  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const { id: orderId, itemId } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const orderItem = await requestRetailerReturnForOrderItem(
      user.id,
      itemId,
      parsed.data.receiptRef,
    );
    await writeAudit({
      actorUserId: user.id,
      action: "order_item.return_requested",
      entityType: "OrderItem",
      entityId: itemId,
      meta: { orderId, receiptRefLength: parsed.data.receiptRef.length },
    });
    return NextResponse.json({ ok: true, orderItem });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Return request failed",
      },
      { status: 400 },
    );
  }
}
