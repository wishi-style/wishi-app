import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/prisma";
import { listProfileBoards } from "@/lib/boards/profile-boards.service";
import { ProfileBoardsManager } from "./profile-boards-manager";

export const dynamic = "force-dynamic";

export default async function ProfileBoardsPage({
  searchParams,
}: {
  searchParams?: Promise<{ style?: string }>;
}) {
  await requireRole("STYLIST");
  const user = await getCurrentAuthUser();
  if (!user) return null;

  const profile = await prisma.stylistProfile.findUnique({
    where: { userId: user.id },
    select: { styleSpecialties: true },
  });
  const focusStyle = (await searchParams)?.style;

  const boards = await listProfileBoards(user.id, focusStyle);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-2 text-3xl font-semibold">Profile boards</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Create 3–10 moodboards for each style you claim. Clients see these on
        your public profile.
      </p>
      <ProfileBoardsManager
        styles={profile?.styleSpecialties ?? []}
        initialBoards={boards.map((b) => ({
          id: b.id,
          profileStyle: b.profileStyle ?? null,
          isFeaturedOnProfile: b.isFeaturedOnProfile,
          coverUrl: b.photos[0]?.url ?? null,
          createdAt: b.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
