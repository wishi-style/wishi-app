import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { setStylistType } from "@/lib/users/admin.service";
import type { StylistType } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  const { id } = await params;
  const body = (await req.json()) as { stylistType?: StylistType };
  if (!body.stylistType || !["PLATFORM", "IN_HOUSE"].includes(body.stylistType)) {
    return NextResponse.json(
      { error: "stylistType must be PLATFORM or IN_HOUSE" },
      { status: 400 },
    );
  }
  await setStylistType({
    userId: id,
    stylistType: body.stylistType,
    actorUserId: admin.userId,
  });
  return NextResponse.json({ ok: true });
}
