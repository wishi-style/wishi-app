// DELETE /api/stylist/profile/boards/[id]
// Unfeatures the board (soft — row stays, isFeaturedOnProfile flips false).

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { unfeatureProfileBoard } from "@/lib/boards/profile-boards.service";
import { isDomainError } from "@/lib/errors/domain-error";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("STYLIST");
    const user = await getCurrentAuthUser();
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const { id } = await context.params;
    await unfeatureProfileBoard(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    if (isDomainError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[profile-boards/delete] failed", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
