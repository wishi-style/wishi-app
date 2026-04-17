import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { reassignStylist } from "@/lib/services/match.service";
import { writeAudit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  const { id } = await params;
  const body = (await req.json()) as {
    newStylistUserId?: string;
    reason?: string;
  };
  const newStylistUserId = body.newStylistUserId?.trim();
  const reason = body.reason?.trim() || "admin_override";
  if (!newStylistUserId) {
    return NextResponse.json(
      { error: "newStylistUserId required" },
      { status: 400 },
    );
  }
  try {
    const result = await reassignStylist({
      sessionId: id,
      newStylistUserId,
      reason,
    });
    await writeAudit({
      actorUserId: admin.userId,
      action: "session.reassign",
      entityType: "Session",
      entityId: id,
      meta: { ...result, reason },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Reassign failed" },
      { status: 400 },
    );
  }
}
