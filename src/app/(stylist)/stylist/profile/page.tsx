import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/prisma";
import { resolveThumbnailsForBoards } from "@/lib/boards/board-thumbnails";
import StylistProfile from "./profile-client";

export const dynamic = "force-dynamic";

export default async function StylistProfilePage() {
  await requireRole("STYLIST");
  const user = await getCurrentAuthUser();
  if (!user) return null;

  const profile = await prisma.stylistProfile.findUnique({
    where: { userId: user.id },
    select: {
      bio: true,
      philosophy: true,
      directorPick: true,
      instagramHandle: true,
      profileMoodboardId: true,
      profileBoards: {
        where: { isFeaturedOnProfile: true },
        select: {
          id: true,
          type: true,
          coverUrl: true,
          profileStyle: true,
          profileGender: true,
          photos: { select: { url: true }, take: 4, orderBy: { orderIndex: "asc" } },
          items: {
            orderBy: { orderIndex: "asc" },
            take: 8,
            select: {
              source: true,
              inventoryProductId: true,
              webItemImageUrl: true,
              closetItem: { select: { url: true } },
              inspirationPhoto: { select: { url: true } },
            },
          },
        },
      },
      profileMoodboard: { select: { photos: { select: { url: true }, take: 1 } } },
    },
  });
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      firstName: true,
      lastName: true,
      avatarUrl: true,
      locations: { select: { city: true, state: true }, take: 1 },
    },
  });

  // Resolve up to 4 thumbnails per board (BoardPhoto for moodboards,
  // resolved BoardItem images for styleboards). Without this, styleboards
  // surface an empty src (they have no BoardPhotos) and Next/Image renders
  // a broken-image icon.
  const thumbsByBoardId = await resolveThumbnailsForBoards(
    profile?.profileBoards ?? [],
    4,
  );

  // Adapt DB row → Loveable's StylistProfileData shape so the verbatim
  // chrome can hydrate from DB on first render. localStorage drafts still
  // override per Loveable's autosave-while-editing pattern.
  const womenBoards = (profile?.profileBoards ?? [])
    .filter((b) => b.profileGender === "FEMALE" || b.profileGender == null)
    .map((b) => ({
      style: b.profileStyle ?? "",
      imageUrls: thumbsByBoardId.get(b.id) ?? [],
    }));
  const menBoards = (profile?.profileBoards ?? [])
    .filter((b) => b.profileGender === "MALE" || b.profileGender == null)
    .map((b) => ({
      style: b.profileStyle ?? "",
      imageUrls: thumbsByBoardId.get(b.id) ?? [],
    }));

  const loc = dbUser?.locations?.[0];
  const initialProfile = {
    fullName: [dbUser?.firstName, dbUser?.lastName].filter(Boolean).join(" "),
    location: [loc?.city, loc?.state].filter(Boolean).join(", "),
    profilePic: dbUser?.avatarUrl ?? "",
    moodBoardImage: profile?.profileMoodboard?.photos[0]?.url ?? "",
    philosophy: profile?.philosophy ?? "",
    directorsPick: profile?.directorPick ?? "",
    bio: profile?.bio ?? "",
    instagram: profile?.instagramHandle ?? "",
    womenBoards,
    menBoards,
  };

  const stylistInitials =
    `${dbUser?.firstName?.[0] ?? ""}${dbUser?.lastName?.[0] ?? ""}`.toUpperCase() ||
    "ST";

  return (
    <StylistProfile
      initialProfile={initialProfile}
      stylistInitials={stylistInitials}
    />
  );
}
