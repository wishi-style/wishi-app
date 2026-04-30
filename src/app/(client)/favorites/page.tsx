import { unauthorized } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listFavoriteStylists } from "@/lib/stylists/favorite-stylist.service";
import { FavoritesClient } from "./client";

export const dynamic = "force-dynamic";

export interface FavoriteLookCard {
  id: string;
  boardId: string;
  sessionId: string | null;
  image: string | null;
  description: string;
  stylist: string;
  savedDate: string;
}

export interface FavoriteStylistCard {
  id: string;
  stylistProfileId: string;
  name: string;
  firstName: string;
  specialty: string;
  location: string;
  avatarUrl: string | null;
  portfolioUrl: string | null;
}

function formatSavedDate(d: Date): string {
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "1 week ago";
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 60) return "1 month ago";
  return `${Math.floor(diffDays / 30)} months ago`;
}

export default async function FavoritesPage() {
  const user = await getCurrentUser();
  if (!user) unauthorized();

  // Loveable's Favorites only has Looks + Stylists tabs. The /feed heart-on-
  // item path still writes FavoriteItem rows, but the listing surface is
  // intentionally dropped per "verbatim port" of smart-spark-craft.
  const [favoriteBoards, favoriteStylists] = await Promise.all([
    prisma.favoriteBoard.findMany({
      where: {
        userId: user.id,
        board: { type: "STYLEBOARD", sessionId: { not: null } },
      },
      include: {
        board: {
          include: {
            session: {
              include: {
                stylist: { select: { firstName: true } },
              },
            },
            photos: {
              select: { url: true },
              orderBy: { orderIndex: "asc" },
              take: 1,
            },
            items: {
              where: { webItemImageUrl: { not: null } },
              select: { webItemImageUrl: true },
              orderBy: { orderIndex: "asc" },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    listFavoriteStylists(user.id),
  ]);

  const looks: FavoriteLookCard[] = favoriteBoards.map((fav) => {
    const board = fav.board;
    const image =
      board.photos[0]?.url ?? board.items[0]?.webItemImageUrl ?? null;
    const description = board.title ?? board.description ?? "Style board";
    const stylist = board.session?.stylist?.firstName ?? "Stylist";
    return {
      id: fav.id,
      boardId: board.id,
      sessionId: board.sessionId,
      image,
      description,
      stylist,
      savedDate: formatSavedDate(fav.createdAt),
    };
  });

  const stylists: FavoriteStylistCard[] = favoriteStylists.map((s) => ({
    id: s.id,
    stylistProfileId: s.stylistProfileId,
    name: s.stylist.name,
    firstName: s.stylist.name.split(" ")[0] ?? s.stylist.name,
    specialty: s.stylist.styleSpecialties[0] ?? "",
    // StylistProfile.location field doesn't exist yet (task #10) — fall back
    // to second specialty so the line still renders the Loveable layout.
    location: s.stylist.styleSpecialties[1] ?? "",
    avatarUrl: s.stylist.avatarUrl,
    portfolioUrl: s.stylist.avatarUrl,
  }));

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-5xl py-10 md:py-16">
        <h1 className="font-display text-3xl md:text-4xl mb-8">Favorites</h1>
        <FavoritesClient looks={looks} stylists={stylists} />
      </div>
    </div>
  );
}
