import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit/log";

export async function startImpersonation({
  adminUserId,
  adminClerkId,
  targetUserId,
  reason,
}: {
  adminUserId: string;
  adminClerkId: string;
  targetUserId: string;
  reason: string;
}) {
  if (adminUserId === targetUserId) {
    throw new Error("Cannot impersonate yourself");
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { clerkId: true },
  });
  if (!target?.clerkId) {
    throw new Error("Target user has no Clerk identity");
  }
  const targetClerkId = target.clerkId;

  // Mint the Clerk actor token inside a Prisma $transaction so that the
  // DB row and the token come into existence together — or not at all.
  // If Clerk fails, the transaction rolls back and there's no orphan
  // AdminImpersonation row to skew "currently impersonating" audits.
  // The reverse edge (Clerk succeeds, Prisma commit fails) leaves a
  // short-TTL actor token unused on Clerk's side, which is acceptable.
  const { impersonationId, tokenUrl } = await prisma.$transaction(async (tx) => {
    const record = await tx.adminImpersonation.create({
      data: { adminUserId, targetUserId, reason },
    });
    const client = await clerkClient();
    const token = await client.actorTokens.create({
      userId: targetClerkId,
      actor: { sub: adminClerkId },
    });
    return { impersonationId: record.id, tokenUrl: token.url };
  });

  await writeAudit({
    actorUserId: adminUserId,
    action: "impersonation.start",
    entityType: "AdminImpersonation",
    entityId: impersonationId,
    meta: { targetUserId, reason },
  });

  return { impersonationId, url: tokenUrl };
}

export async function endImpersonation({
  adminUserId,
  sessionId,
}: {
  adminUserId: string;
  sessionId: string | null;
}) {
  const record = await prisma.adminImpersonation.findFirst({
    where: { adminUserId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });

  if (record) {
    await prisma.adminImpersonation.update({
      where: { id: record.id },
      data: { endedAt: new Date() },
    });
    await writeAudit({
      actorUserId: adminUserId,
      action: "impersonation.end",
      entityType: "AdminImpersonation",
      entityId: record.id,
    });
  }

  if (sessionId) {
    const client = await clerkClient();
    await client.sessions
      .revokeSession(sessionId)
      .catch((err) =>
        console.warn("[impersonation] session revoke failed:", err),
      );
  }
}
