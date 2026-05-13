// Sessionless moodboard creator for /stylist/profile/boards.
// Pre-creates a draft Board(MOODBOARD, sessionId=null, isFeaturedOnProfile=false)
// scoped to the signed-in stylist, then reuses the existing MoodboardBuilder.
// Save publishes via POST /api/profile-boards/[id]/publish.

import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ProfileMoodboardBuilderShell } from "./builder-shell";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ style?: string }>;
}

export default async function NewProfileMoodboardPage({ searchParams }: Props) {
  await requireRole("STYLIST");
  const user = await getCurrentAuthUser();
  if (!user) notFound();

  const profile = await prisma.stylistProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!profile) notFound();

  const styleFromQs = (await searchParams).style?.trim() || null;

  // Reuse an existing unfeatured draft for this stylist + style so accidental
  // double-clicks of +New board don't multiply drafts. Once a draft is
  // published (isFeaturedOnProfile=true), a fresh +New board will spawn a
  // new draft as expected.
  let board = await prisma.board.findFirst({
    where: {
      type: "MOODBOARD",
      sessionId: null,
      stylistProfileId: profile.id,
      isFeaturedOnProfile: false,
      profileStyle: styleFromQs,
    },
    include: { photos: { orderBy: { orderIndex: "asc" } } },
  });
  if (!board) {
    const created = await prisma.board.create({
      data: {
        type: "MOODBOARD",
        sessionId: null,
        stylistProfileId: profile.id,
        isFeaturedOnProfile: false,
        profileStyle: styleFromQs,
      },
    });
    board = { ...created, photos: [] };
  }

  const initialImages = board.photos.map((p) => p.url).filter((u): u is string => !!u);
  const initialPhotoIds = Object.fromEntries(board.photos.map((p) => [p.url, p.id]));

  return (
    <ProfileMoodboardBuilderShell
      boardId={board.id}
      initialStyle={styleFromQs}
      initialImages={initialImages}
      initialPhotoIds={initialPhotoIds}
    />
  );
}
