import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { revokeStylistInvitation } from "@/lib/stylists/invite.service";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  const { id } = await params;
  try {
    const invitation = await revokeStylistInvitation({
      invitationId: id,
      actorUserId: admin.userId,
    });
    return NextResponse.json({ invitation });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Revoke failed" },
      { status: 400 },
    );
  }
}
