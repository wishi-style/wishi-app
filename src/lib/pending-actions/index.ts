import { prisma } from "@/lib/prisma";
import type { PendingActionType, SessionPendingAction, Prisma } from "@/generated/prisma/client";
import { defaultDueAt } from "./policy";

export interface OpenActionOptions {
  boardId?: string | null;
  messageId?: string | null;
  dueAt?: Date;
  tx?: Prisma.TransactionClient;
}

export async function openAction(
  sessionId: string,
  type: PendingActionType,
  opts: OpenActionOptions = {},
): Promise<SessionPendingAction> {
  const db = opts.tx ?? prisma;
  const dueAt = opts.dueAt ?? defaultDueAt(type);
  return db.sessionPendingAction.create({
    data: {
      sessionId,
      type,
      status: "OPEN",
      boardId: opts.boardId ?? null,
      messageId: opts.messageId ?? null,
      dueAt,
    },
  });
}

export interface ResolveActionOptions {
  boardId?: string | null;
  tx?: Prisma.TransactionClient;
}

/**
 * Resolves all OPEN pending actions of a given type for a session.
 * Idempotent — re-calling with the same args is a no-op.
 * Returns the number of rows updated.
 */
export async function resolveAction(
  sessionId: string,
  type: PendingActionType,
  opts: ResolveActionOptions = {},
): Promise<number> {
  const db = opts.tx ?? prisma;
  const result = await db.sessionPendingAction.updateMany({
    where: {
      sessionId,
      type,
      status: "OPEN",
      ...(opts.boardId ? { boardId: opts.boardId } : {}),
    },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
    },
  });
  return result.count;
}

export async function expireAction(id: string): Promise<SessionPendingAction | null> {
  const existing = await prisma.sessionPendingAction.findUnique({ where: { id } });
  if (!existing || existing.status !== "OPEN") return existing;
  return prisma.sessionPendingAction.update({
    where: { id },
    data: { status: "EXPIRED", expiredAt: new Date() },
  });
}

export async function findOverdue(now: Date = new Date()) {
  return prisma.sessionPendingAction.findMany({
    where: { status: "OPEN", dueAt: { lt: now } },
    orderBy: { dueAt: "asc" },
  });
}
