import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { writeAudit } from "@/lib/audit/log";
import { setOrderNotes } from "@/lib/orders/admin-orders.service";

export const dynamic = "force-dynamic";

const Body = z.object({
  notes: z.string().max(4000),
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
  await setOrderNotes(id, parsed.data.notes);
  await writeAudit({
    actorUserId: admin.userId,
    action: "order.notes_updated",
    entityType: "Order",
    entityId: id,
    meta: { length: parsed.data.notes.length },
  });
  return NextResponse.json({ ok: true });
}
