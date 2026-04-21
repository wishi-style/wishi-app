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

  const record = await prisma.adminImpersonation.create({
    data: { adminUserId, targetUserId, reason },
  });

  const client = await clerkClient();
  const token = await client.actorTokens.create({
    userId: target.clerkId,
    actor: { sub: adminClerkId },
  });

  await writeAudit({
    actorUserId: adminUserId,
    action: "impersonation.start",
    entityType: "AdminImpersonation",
    entityId: record.id,
    meta: { targetUserId, reason },
  });

  return {
    impersonationId: record.id,
    url: token.url,
  };
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
