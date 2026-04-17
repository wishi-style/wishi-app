/**
 * Every 15 minutes. Flips SessionPendingAction rows whose dueAt has passed
 * from OPEN → EXPIRED, then emits exactly one `session.overdue` notification
 * per expired action to the stylist.
 *
 * Phase 5 owns this emission. Phase 6's stylist dashboard reads the
 * already-flipped state and must NOT re-emit.
 */
import { prisma } from "@/lib/prisma";
import { notifyStylist } from "@/lib/notifications/dispatcher";
import { resolveAppUrl } from "@/lib/app-url";

interface ExpirySummary extends Record<string, unknown> {
  expired: number;
  notified: number;
}

export async function runPendingActionExpiry(): Promise<ExpirySummary> {
  const now = new Date();
  const due = await prisma.sessionPendingAction.findMany({
    where: { status: "OPEN", dueAt: { lt: now } },
    select: { id: true, sessionId: true, type: true },
  });

  if (due.length === 0) return { expired: 0, notified: 0 };

  // Flip statuses in one shot; emissions are best-effort per-action.
  await prisma.sessionPendingAction.updateMany({
    where: { id: { in: due.map((a) => a.id) } },
    data: { status: "EXPIRED" },
  });

  let notified = 0;
  for (const action of due) {
    try {
      await notifyStylist(action.sessionId, {
        event: "session.overdue",
        title: "An action on your session is overdue",
        body: `The deadline passed on ${prettyType(action.type)}.`,
        url: `${resolveAppUrl({ envAppUrl: process.env.APP_URL })}/stylist/sessions/${action.sessionId}`,
      });
      notified += 1;
    } catch (err) {
      console.warn(
        `[pending-action-expiry] notify failed for ${action.id}:`,
        err,
      );
    }
  }
  return { expired: due.length, notified };
}

function prettyType(type: string): string {
  return type
    .replace(/^PENDING_/, "")
    .toLowerCase()
    .replace(/_/g, " ");
}
