import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { startImpersonation } from "@/lib/admin/impersonation.service";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (admin.isImpersonating) {
    return NextResponse.json(
      { error: "Already impersonating; end current session first" },
      { status: 400 },
    );
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = body.reason?.trim();
  if (!reason) {
    return NextResponse.json({ error: "reason required" }, { status: 400 });
  }

  try {
    const result = await startImpersonation({
      adminUserId: admin.userId,
      adminClerkId: admin.clerkId,
      targetUserId: id,
      reason,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Impersonation failed" },
      { status: 400 },
    );
  }
}
