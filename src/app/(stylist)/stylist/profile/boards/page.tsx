import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/prisma";
import { listProfileBoards } from "@/lib/boards/profile-boards.service";
import { resolveThumbnailsForBoards } from "@/lib/boards/board-thumbnails";
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
  // Always load every featured board for this stylist so the tab counts
  // are accurate. The ?style= query param is forwarded to the manager as a
  // *focus* hint (which tab to open), not a DB filter — pre-fix the page
  // dropped boards from other styles entirely, making them disappear.
  const focusStyle = (await searchParams)?.style ?? null;
  const boards = await listProfileBoards(user.id);
  // Resolve up to 4 thumbnails per board. For STYLEBOARDs this hits
  // tastegraph for INVENTORY items so the manager card can show all
  // canvas pieces, not just the first cover.
  const thumbsByBoardId = await resolveThumbnailsForBoards(boards, 4);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <Link
        href="/stylist/profile"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-body text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        Back to profile
      </Link>
      <h1 className="mb-2 text-3xl font-semibold">Profile boards</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Create 3–10 boards for each style you claim. Clients see these on your
        public profile.
      </p>
      <ProfileBoardsManager
        styles={profile?.styleSpecialties ?? []}
        focusStyle={focusStyle}
        initialBoards={boards.map((b) => {
          const thumbs = thumbsByBoardId.get(b.id) ?? [];
          return {
            id: b.id,
            type: b.type,
            profileStyle: b.profileStyle ?? null,
            isFeaturedOnProfile: b.isFeaturedOnProfile,
            coverUrl: b.coverUrl ?? thumbs[0] ?? null,
            thumbnailUrls: thumbs,
            createdAt: b.createdAt.toISOString(),
          };
        })}
      />
    </div>
  );
}
