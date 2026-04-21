import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { freezeSession } from "@/lib/sessions/transitions";
import { writeAudit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  const { id } = await params;
  const body = (await req.json()) as { reason?: string };
  const reason = body.reason?.trim();
  if (!reason) {
    return NextResponse.json({ error: "reason required" }, { status: 400 });
  }
  try {
    await freezeSession(id, reason);
    await writeAudit({
      actorUserId: admin.userId,
      action: "session.freeze",
      entityType: "Session",
      entityId: id,
      meta: { reason },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Freeze failed" },
      { status: 400 },
    );
  }
}
