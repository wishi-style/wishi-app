import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export type AuditAction =
  | "user.role_change"
  | "user.promote_stylist"
  | "user.set_stylist_type"
  | "user.set_director_pick"
  | "user.note_added"
  | "stylist.approve"
  | "stylist.request_changes"
  | "session.reassign"
  | "session.freeze"
  | "session.unfreeze"
  | "session.cancel"
  | "subscription.pause"
  | "subscription.cancel"
  | "subscription.reactivate"
  | "inspiration.update"
  | "inspiration.deactivate"
  | "looks.create"
  | "looks.update"
  | "looks.delete"
  | "quiz.update"
  | "quiz.question_add"
  | "quiz.question_update"
  | "quiz.question_remove"
  | "quiz.publish"
  | "impersonation.start"
  | "impersonation.end"
  | "order.tracking_set"
  | "order.status_changed"
  | "order.notes_updated"
  | "order.refund_issued"
  | "order.refund_approved"
  | "order.return_initiated";

type WriteAuditArgs = {
  actorUserId: string | null;
  action: AuditAction | string;
  entityType: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
};

export async function writeAudit({
  actorUserId,
  action,
  entityType,
  entityId = null,
  meta,
}: WriteAuditArgs) {
  await prisma.auditLog.create({
    data: {
      actorUserId,
      action,
      entityType,
      entityId,
      meta: meta ? (meta as Prisma.InputJsonValue) : undefined,
    },
  });
}
