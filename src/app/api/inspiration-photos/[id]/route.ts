import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  updateInspirationPhoto,
  softDeleteInspirationPhoto,
  reactivateInspirationPhoto,
} from "@/lib/boards/inspiration.service";
import { writeAudit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  const { id } = await params;
  const body = (await req.json()) as {
    title?: string | null;
    category?: string | null;
    tags?: string[];
    reactivate?: boolean;
  };

  if (body.reactivate) {
    await reactivateInspirationPhoto(id);
    await writeAudit({
      actorUserId: admin.userId,
      action: "inspiration.update",
      entityType: "InspirationPhoto",
      entityId: id,
      meta: { reactivated: true },
    });
    return NextResponse.json({ ok: true });
  }

  const updated = await updateInspirationPhoto(id, {
    title: body.title,
    category: body.category,
    tags: body.tags,
  });
  await writeAudit({
    actorUserId: admin.userId,
    action: "inspiration.update",
    entityType: "InspirationPhoto",
    entityId: id,
    meta: { title: body.title, category: body.category, tags: body.tags },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  const { id } = await params;
  await softDeleteInspirationPhoto(id);
  await writeAudit({
    actorUserId: admin.userId,
    action: "inspiration.deactivate",
    entityType: "InspirationPhoto",
    entityId: id,
  });
  return NextResponse.json({ ok: true });
}
