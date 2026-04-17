import { prisma } from "@/lib/prisma";
import type { BoardType } from "@/generated/prisma/client";

export type AdminLookRow = {
  id: string;
  type: BoardType;
  title: string | null;
  profileStyle: string | null;
  ownerName: string | null;
  ownerKind: "editorial" | "stylist-profile";
  isFeaturedOnProfile: boolean;
  createdAt: Date;
};

export async function listAdminLooks(filter?: {
  kind?: "editorial" | "stylist-profile";
  take?: number;
}): Promise<AdminLookRow[]> {
  const boards = await prisma.board.findMany({
    where: {
      sessionId: null,
      stylistProfileId:
        filter?.kind === "editorial" ? null : filter?.kind ? { not: null } : undefined,
    },
    orderBy: { createdAt: "desc" },
    take: filter?.take ?? 200,
    select: {
      id: true,
      type: true,
      title: true,
      profileStyle: true,
      isFeaturedOnProfile: true,
      createdAt: true,
      stylistProfile: {
        select: {
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  return boards.map((b) => ({
    id: b.id,
    type: b.type,
    title: b.title,
    profileStyle: b.profileStyle,
    ownerKind: b.stylistProfile ? "stylist-profile" : "editorial",
    ownerName: b.stylistProfile
      ? `${b.stylistProfile.user.firstName} ${b.stylistProfile.user.lastName}`
      : null,
    isFeaturedOnProfile: b.isFeaturedOnProfile,
    createdAt: b.createdAt,
  }));
}
