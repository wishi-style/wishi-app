import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit/log";
import { notifyWaitlistForStylist } from "./waitlist-fanout";

export async function getAdminStylistDetail(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      stylistProfile: {
        include: {
          profileMoodboard: true,
          profileBoards: {
            where: { isFeaturedOnProfile: true },
            take: 20,
            orderBy: { createdAt: "desc" },
          },
          reviews: {
            take: 20,
            orderBy: { createdAt: "desc" },
          },
          waitlistEntries: {
            where: { status: "PENDING" },
            select: { id: true },
          },
        },
      },
    },
  });
}

export async function approveStylistMatchEligibility({
  stylistUserId,
  actorUserId,
}: {
  stylistUserId: string;
  actorUserId: string;
}) {
  const profile = await prisma.stylistProfile.findUnique({
    where: { userId: stylistUserId },
  });
  if (!profile) throw new Error("Stylist profile not found");
  if (profile.matchEligible) {
    throw new Error("Stylist is already match-eligible");
  }

  await prisma.stylistProfile.update({
    where: { userId: stylistUserId },
    data: {
      matchEligible: true,
      matchEligibleSetAt: new Date(),
      matchEligibleSetBy: actorUserId,
      onboardingStatus: "ELIGIBLE",
    },
  });

  await writeAudit({
    actorUserId,
    action: "stylist.approve",
    entityType: "StylistProfile",
    entityId: profile.id,
    meta: { stylistUserId },
  });

  const fanout = await notifyWaitlistForStylist(profile.id);

  return { stylistProfileId: profile.id, notified: fanout.notified };
}
