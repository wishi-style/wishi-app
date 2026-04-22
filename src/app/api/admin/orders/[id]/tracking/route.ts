import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { writeAudit } from "@/lib/audit/log";
import { setOrderTracking } from "@/lib/orders/admin-orders.service";

export const dynamic = "force-dynamic";

const Body = z.object({
  trackingNumber: z.string().min(1).max(120),
  carrier: z.string().min(1).max(60),
  estimatedDeliveryAt: z.string().datetime().optional(),
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
    const updated = await setOrderTracking(id, {
      trackingNumber: parsed.data.trackingNumber,
      carrier: parsed.data.carrier,
      estimatedDeliveryAt: parsed.data.estimatedDeliveryAt
        ? new Date(parsed.data.estimatedDeliveryAt)
        : null,
    });
    await writeAudit({
      actorUserId: admin.userId,
      action: "order.tracking_set",
      entityType: "Order",
      entityId: id,
      meta: {
        trackingNumber: parsed.data.trackingNumber,
        carrier: parsed.data.carrier,
      },
    });
    return NextResponse.json({ ok: true, order: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Tracking update failed" },
      { status: 400 },
    );
  }
}
