import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { writeAudit } from "@/lib/audit/log";
import {
  transitionOrderItemStatus,
  UNFULFILLABLE_REASONS,
} from "@/lib/orders/admin-orders.service";

export const dynamic = "force-dynamic";

const Body = z.object({
  status: z.enum(["PURCHASED", "UNFULFILLABLE", "RETURNED"]),
  retailerOrderRef: z.string().trim().min(1).max(120).optional(),
  unfulfillableReason: z.enum(UNFULFILLABLE_REASONS).optional(),
  unfulfillableNotes: z.string().trim().max(2000).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const admin = await requireAdmin();
  const { id, itemId } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const result = await transitionOrderItemStatus(itemId, parsed.data.status, {
      retailerOrderRef: parsed.data.retailerOrderRef ?? null,
      unfulfillableReason: parsed.data.unfulfillableReason ?? null,
      unfulfillableNotes: parsed.data.unfulfillableNotes ?? null,
    });
    await writeAudit({
      actorUserId: admin.userId,
      action: "order_item.status_changed",
      entityType: "OrderItem",
      entityId: itemId,
      meta: {
        orderId: id,
        to: parsed.data.status,
        refundedInCents: result.refundedInCents,
        stripeRefundId: result.stripeRefundId,
        orderRolledUp: result.orderRolledUp,
        reason: parsed.data.unfulfillableReason ?? null,
      },
    });
    return NextResponse.json({
      ok: true,
      orderItem: result.orderItem,
      refundedInCents: result.refundedInCents,
      stripeRefundId: result.stripeRefundId,
      orderRolledUp: result.orderRolledUp,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "OrderItem transition failed",
      },
      { status: 400 },
    );
  }
}
