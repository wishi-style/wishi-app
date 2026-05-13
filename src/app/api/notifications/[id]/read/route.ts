import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const { userId: clerkId } = await getServerAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findFirst({
    where: { clerkId, deletedAt: null },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // updateMany with userId guard makes this idempotent + ownership-checked.
  // Returns 0 either when the row doesn't exist or when it isn't ours.
  const result = await prisma.notification.updateMany({
    where: { id, userId: user.id },
    data: { readAt: new Date() },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const after = await prisma.notification.findUnique({ where: { id } });
  return NextResponse.json({ readAt: after?.readAt ?? null });
}
