import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { adminCancelSubscription } from "@/lib/payments/subscription-actions";
import { writeAudit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = body.reason?.trim() || "admin_override";
  try {
    await adminCancelSubscription(id);
    await writeAudit({
      actorUserId: admin.userId,
      action: "subscription.cancel",
      entityType: "Subscription",
      entityId: id,
      meta: { reason },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cancel failed" },
      { status: 400 },
    );
  }
}
