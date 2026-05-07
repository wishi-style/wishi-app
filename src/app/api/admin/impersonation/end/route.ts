import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/prisma";
import { endImpersonation } from "@/lib/admin/impersonation.service";

export const dynamic = "force-dynamic";

/**
 * Callable either from the impersonated session (banner → "End session")
 * or from the admin session. Walks back to whichever admin kicked off the
 * currently-open AdminImpersonation row and closes it, then revokes the
 * Clerk session so the browser is signed out.
 */
export async function POST() {
  const session = await getServerAuth();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const act = (
    session.sessionClaims as { act?: { sub?: string } } | undefined
  )?.act;

  // Impersonated session → admin is session.sessionClaims.act.sub
  // Admin session → admin is session.userId
  const adminClerkId = act?.sub ?? session.userId;

  const admin = await prisma.user.findUnique({
    where: { clerkId: adminClerkId },
    select: { id: true },
  });

  if (admin) {
    const sessionId =
      "sessionId" in session && typeof session.sessionId === "string"
        ? session.sessionId
        : null;
    await endImpersonation({
      adminUserId: admin.id,
      sessionId,
    });
  }

  return NextResponse.json({ ok: true });
}
