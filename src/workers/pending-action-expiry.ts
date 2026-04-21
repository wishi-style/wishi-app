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

  let expired = 0;
  let notified = 0;
  for (const action of due) {
    // Atomic claim: only the run that wins the OPEN→EXPIRED flip gets to
    // notify. Overlapping runs that see the same row here will get count=0
    // and silently drop the notification, making emission exactly-once.
    const { count } = await prisma.sessionPendingAction.updateMany({
      where: { id: action.id, status: "OPEN" },
      data: { status: "EXPIRED" },
    });
    if (count === 0) continue;
    expired += 1;
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
  return { expired, notified };
}

function prettyType(type: string): string {
  return type
    .replace(/^PENDING_/, "")
    .toLowerCase()
    .replace(/_/g, " ");
}
