import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit/log";
import { syncClerkRoleForUser } from "@/lib/auth/reconcile-clerk-user";
import type { StylistType, UserRole } from "@/generated/prisma/client";

export type AdminUserRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  stylistType: StylistType | null;
  createdAt: Date;
};

export async function listAdminUsers(filter?: {
  role?: UserRole;
  search?: string;
  take?: number;
  skip?: number;
}): Promise<AdminUserRow[]> {
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      role: filter?.role,
      OR: filter?.search
        ? [
            { email: { contains: filter.search, mode: "insensitive" } },
            { firstName: { contains: filter.search, mode: "insensitive" } },
            { lastName: { contains: filter.search, mode: "insensitive" } },
          ]
        : undefined,
    },
    orderBy: { createdAt: "desc" },
    take: filter?.take ?? 200,
    skip: filter?.skip,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      createdAt: true,
      stylistProfile: { select: { stylistType: true } },
    },
  });

  return users.map((u) => ({
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    stylistType: u.stylistProfile?.stylistType ?? null,
    createdAt: u.createdAt,
  }));
}

export async function promoteToStylist({
  userId,
  stylistType,
  actorUserId,
}: {
  userId: string;
  stylistType: StylistType;
  actorUserId: string;
}) {
  const existing = await prisma.stylistProfile.findUnique({ where: { userId } });
  if (existing) throw new Error("User already has a stylist profile");

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { role: "STYLIST" },
    }),
    prisma.stylistProfile.create({
      data: { userId, stylistType, onboardingStatus: "NOT_STARTED" },
    }),
  ]);

  // Push the new role into Clerk so the next JWT rotation picks it up.
  // Without this, the freshly-promoted stylist hits forbidden() on every
  // /stylist/* page until something else writes Clerk metadata.
  await syncClerkRoleForUser(userId);

  await writeAudit({
    actorUserId,
    action: "user.promote_stylist",
    entityType: "User",
    entityId: userId,
    meta: { stylistType },
  });
}

export async function setStylistType({
  userId,
  stylistType,
  actorUserId,
}: {
  userId: string;
  stylistType: StylistType;
  actorUserId: string;
}) {
  const profile = await prisma.stylistProfile.update({
    where: { userId },
    data: { stylistType },
    select: { id: true },
  });
  await writeAudit({
    actorUserId,
    action: "user.set_stylist_type",
    entityType: "StylistProfile",
    entityId: profile.id,
    meta: { userId, stylistType },
  });
}

export async function setDirectorPick({
  userId,
  directorPick,
  actorUserId,
}: {
  userId: string;
  directorPick: string | null;
  actorUserId: string;
}) {
  const profile = await prisma.stylistProfile.update({
    where: { userId },
    data: { directorPick },
    select: { id: true },
  });
  await writeAudit({
    actorUserId,
    action: "user.set_director_pick",
    entityType: "StylistProfile",
    entityId: profile.id,
    meta: { userId, directorPick },
  });
}

export async function getAdminUserDetail(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      stylistProfile: true,
      notes: { orderBy: { createdAt: "desc" }, take: 50 },
      clientSessions: {
        take: 10,
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, planType: true, createdAt: true },
      },
      stylistSessions: {
        take: 10,
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, planType: true, createdAt: true },
      },
      subscriptions: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          planType: true,
          status: true,
          frequency: true,
          currentPeriodEnd: true,
        },
      },
    },
  });
}
