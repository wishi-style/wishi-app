import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/prisma";
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
          profileStyle: true,
          profileGender: true,
          photos: { select: { url: true }, take: 1 },
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

  // Adapt DB row → Loveable's StylistProfileData shape so the verbatim
  // chrome can hydrate from DB on first render. localStorage drafts still
  // override per Loveable's autosave-while-editing pattern.
  const womenBoards = (profile?.profileBoards ?? [])
    .filter((b) => b.profileGender === "FEMALE" || b.profileGender == null)
    .map((b) => ({
      style: b.profileStyle ?? "",
      imageUrl: b.photos[0]?.url ?? "",
    }));
  const menBoards = (profile?.profileBoards ?? [])
    .filter((b) => b.profileGender === "MALE" || b.profileGender == null)
    .map((b) => ({
      style: b.profileStyle ?? "",
      imageUrl: b.photos[0]?.url ?? "",
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

  return <StylistProfile initialProfile={initialProfile} />;
}
