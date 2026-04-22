import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { initiateReturn } from "@/lib/orders/client-orders.service";
import { writeAudit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await requireAuth();
  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const { id } = await params;

  try {
    const order = await initiateReturn(user.id, id);
    await writeAudit({
      actorUserId: user.id,
      action: "order.return_initiated",
      entityType: "Order",
      entityId: id,
      meta: { source: "client_self_serve" },
    });
    // Klaviyo "return-instructions" email + customer-team task notification:
    // Klaviyo wiring lands with the broader notifications work in 9b/Phase 11;
    // for now the audit row is the durable record customer-team monitors.
    return NextResponse.json({ ok: true, order });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Return failed";
    const status = message.includes("not eligible") || message.includes("window") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
