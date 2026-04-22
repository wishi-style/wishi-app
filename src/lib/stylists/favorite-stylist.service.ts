import { prisma } from "@/lib/prisma";
import type { FavoriteStylist } from "@/generated/prisma/client";

export async function favoriteStylist(
  userId: string,
  stylistProfileId: string,
): Promise<FavoriteStylist> {
  return prisma.favoriteStylist.upsert({
    where: { userId_stylistProfileId: { userId, stylistProfileId } },
    create: { userId, stylistProfileId },
    update: {},
  });
}

export async function unfavoriteStylist(
  userId: string,
  stylistProfileId: string,
): Promise<number> {
  const result = await prisma.favoriteStylist.deleteMany({
    where: { userId, stylistProfileId },
  });
  return result.count;
}

export async function isStylistFavorited(
  userId: string,
  stylistProfileId: string,
): Promise<boolean> {
  const row = await prisma.favoriteStylist.findUnique({
    where: { userId_stylistProfileId: { userId, stylistProfileId } },
    select: { id: true },
  });
  return row != null;
}

export interface FavoriteStylistListItem {
  id: string;
  stylistProfileId: string;
  createdAt: Date;
  stylist: {
    id: string;
    name: string;
    avatarUrl: string | null;
    bio: string | null;
    styleSpecialties: string[];
    isAvailable: boolean;
  };
}

export async function listFavoriteStylists(
  userId: string,
): Promise<FavoriteStylistListItem[]> {
  const rows = await prisma.favoriteStylist.findMany({
    where: { userId },
    include: {
      stylistProfile: {
        include: {
          user: { select: { firstName: true, lastName: true, avatarUrl: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((row) => ({
    id: row.id,
    stylistProfileId: row.stylistProfileId,
    createdAt: row.createdAt,
    stylist: {
      id: row.stylistProfile.id,
      name: `${row.stylistProfile.user.firstName} ${row.stylistProfile.user.lastName}`,
      avatarUrl: row.stylistProfile.user.avatarUrl,
      bio: row.stylistProfile.bio,
      styleSpecialties: row.stylistProfile.styleSpecialties,
      isAvailable: row.stylistProfile.isAvailable,
    },
  }));
}
