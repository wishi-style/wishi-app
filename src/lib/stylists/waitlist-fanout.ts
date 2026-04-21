import { prisma } from "@/lib/prisma";
import { dispatchNotification } from "@/lib/notifications/dispatcher";

/**
 * Called when a stylist becomes match-eligible (admin approve). Marks every
 * PENDING waitlist entry as NOTIFIED and fans out a Web Push. Klaviyo
 * email/SMS lands alongside Phase 9 and plugs in via the dispatcher.
 */
export async function notifyWaitlistForStylist(
  stylistProfileId: string,
): Promise<{ notified: number }> {
  const [profile, entries] = await Promise.all([
    prisma.stylistProfile.findUnique({
      where: { id: stylistProfileId },
      select: {
        user: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.stylistWaitlistEntry.findMany({
      where: { stylistProfileId, status: "PENDING" },
      select: { id: true, userId: true },
    }),
  ]);

  if (!profile || entries.length === 0) {
    return { notified: 0 };
  }

  const stylistName = `${profile.user.firstName} ${profile.user.lastName}`;

  const results = await Promise.all(
    entries.map(async (e) => {
      try {
        await dispatchNotification({
          event: "stylist.waitlist_available",
          userId: e.userId,
          title: "Your stylist is available",
          body: `${stylistName} is taking new clients. Book a session.`,
          url: "/stylists",
        });
        return e.id;
      } catch (err) {
        console.warn(
          "[waitlist-fanout] push failed for user",
          e.userId,
          err,
        );
        return null;
      }
    }),
  );

  const notifiedIds = results.filter((id): id is string => id !== null);
  if (notifiedIds.length) {
    await prisma.stylistWaitlistEntry.updateMany({
      where: { id: { in: notifiedIds } },
      data: { status: "NOTIFIED", notifiedAt: new Date() },
    });
  }

  return { notified: notifiedIds.length };
}
