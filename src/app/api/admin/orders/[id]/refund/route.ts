import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { writeAudit } from "@/lib/audit/log";
import { refundOrder } from "@/lib/orders/admin-orders.service";

export const dynamic = "force-dynamic";

const Body = z.object({
  amountInCents: z.number().int().min(1),
  reason: z.string().max(500).optional(),
});

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
  try {
    const result = await refundOrder(id, parsed.data.amountInCents, parsed.data.reason);
    await writeAudit({
      actorUserId: admin.userId,
      action: "order.refund_issued",
      entityType: "Order",
      entityId: id,
      meta: {
        amountInCents: parsed.data.amountInCents,
        reason: parsed.data.reason ?? null,
        warning: result.warning,
        stripeRefundId: result.stripeRefundId,
      },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Refund failed" },
      { status: 400 },
    );
  }
}
