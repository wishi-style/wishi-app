import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit/log";
import { refundOrder, transitionOrderStatus } from "@/lib/orders/admin-orders.service";

export const dynamic = "force-dynamic";

const Body = z.object({
  amountInCents: z.number().int().min(1),
  reason: z.string().max(500).optional(),
});

/**
 * Approve a customer-initiated return: refund + advance status to RETURNED.
 * Distinct from /refund (which is admin-discretion at any status). This path
 * is only valid on orders already in RETURN_IN_PROCESS, since that's the
 * gate the self-serve return endpoint puts them in.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.status !== "RETURN_IN_PROCESS") {
    return NextResponse.json(
      {
        error: `Cannot approve refund — order status is ${order.status}, expected RETURN_IN_PROCESS`,
      },
      { status: 400 },
    );
  }

  try {
    const refund = await refundOrder(id, parsed.data.amountInCents, parsed.data.reason);
    await transitionOrderStatus(id, "RETURNED");
    await writeAudit({
      actorUserId: admin.userId,
      action: "order.refund_approved",
      entityType: "Order",
      entityId: id,
      meta: {
        amountInCents: parsed.data.amountInCents,
        reason: parsed.data.reason ?? null,
        warning: refund.warning,
        stripeRefundId: refund.stripeRefundId,
      },
    });
    return NextResponse.json({ ok: true, ...refund });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Approve refund failed" },
      { status: 400 },
    );
  }
}
