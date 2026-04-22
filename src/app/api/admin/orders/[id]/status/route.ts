import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { writeAudit } from "@/lib/audit/log";
import { transitionOrderStatus } from "@/lib/orders/admin-orders.service";

export const dynamic = "force-dynamic";

const Body = z.object({
  status: z.enum(["ORDERED", "SHIPPED", "ARRIVED", "RETURN_IN_PROCESS", "RETURNED"]),
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
    const updated = await transitionOrderStatus(id, parsed.data.status);
    await writeAudit({
      actorUserId: admin.userId,
      action: "order.status_changed",
      entityType: "Order",
      entityId: id,
      meta: { to: parsed.data.status },
    });
    return NextResponse.json({ ok: true, order: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Status transition failed" },
      { status: 400 },
    );
  }
}
