import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getClosetItem,
  softDeleteClosetItem,
} from "@/lib/boards/closet.service";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const item = await getClosetItem(user.id, id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(item);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await softDeleteClosetItem(user.id, id);
  return NextResponse.json({ ok: true });
}
