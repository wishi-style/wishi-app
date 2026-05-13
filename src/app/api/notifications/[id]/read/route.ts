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

  // Only flip readAt on the first call so it represents the genuine
  // first-read timestamp. updateMany with userId + readAt: null guards
  // both ownership and idempotency.
  const result = await prisma.notification.updateMany({
    where: { id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  // result.count === 0 has two meanings: (a) the row exists but was
  // already read, or (b) it doesn't exist or isn't ours. Disambiguate.
  if (result.count === 0) {
    const existing = await prisma.notification.findFirst({
      where: { id, userId: user.id },
      select: { readAt: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ readAt: existing.readAt });
  }

  const after = await prisma.notification.findUnique({
    where: { id },
    select: { readAt: true },
  });
  return NextResponse.json({ readAt: after?.readAt ?? null });
}
