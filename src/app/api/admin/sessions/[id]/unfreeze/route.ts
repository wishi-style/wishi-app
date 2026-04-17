import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { unfreezeSession } from "@/lib/sessions/transitions";
import { writeAudit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  const { id } = await params;
  try {
    await unfreezeSession(id);
    await writeAudit({
      actorUserId: admin.userId,
      action: "session.unfreeze",
      entityType: "Session",
      entityId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unfreeze failed" },
      { status: 400 },
    );
  }
}
