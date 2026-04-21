import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { approveStylistMatchEligibility } from "@/lib/stylists/admin.service";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  const { id } = await params;
  try {
    const result = await approveStylistMatchEligibility({
      stylistUserId: id,
      actorUserId: admin.userId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Approve failed" },
      { status: 400 },
    );
  }
}
