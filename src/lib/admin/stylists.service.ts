import { prisma } from "@/lib/prisma";
import type {
  StylistOnboardingStatus,
  StylistType,
} from "@/generated/prisma/client";

export type AdminStylistRow = {
  userId: string;
  name: string;
  email: string;
  stylistType: StylistType;
  onboardingStatus: StylistOnboardingStatus;
  matchEligible: boolean;
  stripeConnected: boolean;
  pendingWaitlist: number;
  createdAt: Date;
};

export async function listAdminStylists(filter?: {
  onboardingStatus?: StylistOnboardingStatus;
  eligibleOnly?: boolean;
}): Promise<AdminStylistRow[]> {
  const profiles = await prisma.stylistProfile.findMany({
    where: {
      onboardingStatus: filter?.onboardingStatus,
      matchEligible: filter?.eligibleOnly ? true : undefined,
      user: { deletedAt: null },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userId: true,
      stylistType: true,
      onboardingStatus: true,
      matchEligible: true,
      stripeConnectId: true,
      createdAt: true,
      user: { select: { firstName: true, lastName: true, email: true } },
      _count: {
        select: {
          waitlistEntries: { where: { status: "PENDING" } },
        },
      },
    },
  });

  return profiles.map((p) => ({
    userId: p.userId,
    name: `${p.user.firstName} ${p.user.lastName}`,
    email: p.user.email,
    stylistType: p.stylistType,
    onboardingStatus: p.onboardingStatus,
    matchEligible: p.matchEligible,
    stripeConnected: Boolean(p.stripeConnectId),
    pendingWaitlist: p._count.waitlistEntries,
    createdAt: p.createdAt,
  }));
}
