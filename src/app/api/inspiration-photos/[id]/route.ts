import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { softDeleteInspirationPhoto } from "@/lib/boards/inspiration.service";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireRole("ADMIN");
  const { id } = await params;
  await softDeleteInspirationPhoto(id);
  return NextResponse.json({ ok: true });
}
