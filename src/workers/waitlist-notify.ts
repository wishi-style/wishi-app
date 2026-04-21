// Waitlist notify worker: fans out STYLIST_AVAILABLE notifications to every
// PENDING StylistWaitlistEntry for a stylist who just became available.
//
// "Became available" is detected from two state flips:
//   1. StylistProfile.isAvailable: false → true
//   2. StylistProfile.matchEligible: false → true
//
// For simplicity this worker does not track the previous state — it scans
// all PENDING entries whose stylist is currently `isAvailable && matchEligible`
// and marks them NOTIFIED. Idempotent: once an entry is NOTIFIED the worker
// skips it; if the user books, domain logic elsewhere flips it to CONVERTED.

import { prisma } from "@/lib/prisma";
import { dispatchNotification } from "@/lib/notifications/dispatcher";

export type WaitlistNotifyResult = {
  scanned: number;
  notified: number;
};

export async function runWaitlistNotify(): Promise<WaitlistNotifyResult> {
  // Find pending entries whose stylist is now available + match-eligible.
  const entries = await prisma.stylistWaitlistEntry.findMany({
    where: {
      status: "PENDING",
      stylistProfile: {
        isAvailable: true,
        matchEligible: true,
      },
    },
    select: {
      id: true,
      userId: true,
      stylistProfile: {
        select: {
          id: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
    take: 500,
  });

  let notified = 0;
  for (const entry of entries) {
    const stylistName = `${entry.stylistProfile.user.firstName} ${entry.stylistProfile.user.lastName}`.trim();
    try {
      // Dispatch the notification FIRST — only flip status=NOTIFIED after the
      // dispatcher returns. If we flipped first and dispatch threw, the entry
      // would be marked delivered even though the user never got pinged, and
      // subsequent runs skip it forever. Dispatch-first means a failure
      // leaves the entry PENDING, so the next hourly run retries it.
      await dispatchNotification({
        event: "stylist.available",
        userId: entry.userId,
        title: "A stylist you wanted is available",
        body: `${stylistName || "Your stylist"} can take new bookings. Tap to book.`,
        url: `/stylists/${entry.stylistProfile.id}`,
      });
      await prisma.stylistWaitlistEntry.update({
        where: { id: entry.id },
        data: { status: "NOTIFIED", notifiedAt: new Date() },
      });
      notified += 1;
    } catch (err) {
      console.error("[waitlist-notify] failed entry", entry.id, err);
    }
  }

  return { scanned: entries.length, notified };
}
