import { prisma } from "@/lib/prisma";

export type AuditLogRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  meta: unknown;
  createdAt: Date;
};

export async function listAuditLog(filter?: {
  entityType?: string;
  action?: string;
  actorUserId?: string;
  since?: Date;
  until?: Date;
  take?: number;
}): Promise<AuditLogRow[]> {
  const rows = await prisma.auditLog.findMany({
    where: {
      entityType: filter?.entityType,
      action: filter?.action,
      actorUserId: filter?.actorUserId,
      createdAt: {
        gte: filter?.since,
        lte: filter?.until,
      },
    },
    orderBy: { createdAt: "desc" },
    take: filter?.take ?? 200,
  });

  const actorIds = [
    ...new Set(rows.map((r) => r.actorUserId).filter(Boolean) as string[]),
  ];
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : [];
  const actorMap = new Map(actors.map((a) => [a.id, a]));

  return rows.map((r) => {
    const actor = r.actorUserId ? actorMap.get(r.actorUserId) : undefined;
    return {
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      actorUserId: r.actorUserId,
      actorName: actor ? `${actor.firstName} ${actor.lastName}` : null,
      actorEmail: actor?.email ?? null,
      meta: r.meta,
      createdAt: r.createdAt,
    };
  });
}
