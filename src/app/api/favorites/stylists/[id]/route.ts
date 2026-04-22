import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { unfavoriteStylist } from "@/lib/stylists/favorite-stylist.service";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export async function DELETE(_req: Request, { params }: Props) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const removed = await unfavoriteStylist(user.id, id);
  return NextResponse.json({ removed });
}
