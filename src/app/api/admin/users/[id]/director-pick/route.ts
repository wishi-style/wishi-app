import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { setDirectorPick } from "@/lib/users/admin.service";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  const { id } = await params;
  const body = (await req.json()) as { directorPick?: string | null };
  await setDirectorPick({
    userId: id,
    directorPick: body.directorPick?.trim() ? body.directorPick.trim() : null,
    actorUserId: admin.userId,
  });
  return NextResponse.json({ ok: true });
}
