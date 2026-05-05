// Persistence helpers for the two stylist-profile images: the user's
// avatar (User.avatarUrl) and the profile moodboard (Board+BoardPhoto
// rooted at StylistProfile.profileMoodboardId). Both are wired up by
// the /stylist/profile editor — the client uploads the file directly to
// S3 via a presigned URL, then calls saveStylistProfile() with the
// resulting public URL + s3 key.

import { prisma } from "@/lib/prisma";

export async function setAvatar(
  userId: string,
  url: string,
): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { avatarUrl: url } });
}

export async function setProfileMoodboard(
  userId: string,
  s3Key: string,
  url: string,
): Promise<{ boardId: string; photoId: string }> {
  const profile = await prisma.stylistProfile.findUnique({
    where: { userId },
    select: { id: true, profileMoodboardId: true },
  });
  if (!profile) throw new Error(`No stylist profile for user ${userId}`);

  return prisma.$transaction(async (tx) => {
    // Replace any existing photos on the profile moodboard so a single
    // image identifies the board (Loveable's profile mood-board UI is a
    // single square thumbnail, not a 9-tile grid like session moodboards).
    if (profile.profileMoodboardId) {
      await tx.boardPhoto.deleteMany({
        where: { boardId: profile.profileMoodboardId },
      });
      const photo = await tx.boardPhoto.create({
        data: {
          boardId: profile.profileMoodboardId,
          s3Key,
          url,
          orderIndex: 0,
        },
      });
      return { boardId: profile.profileMoodboardId, photoId: photo.id };
    }

    const board = await tx.board.create({
      data: {
        type: "MOODBOARD",
        stylistProfileId: profile.id,
        // sessionId stays null for profile-scoped boards; isFeaturedOnProfile
        // mirrors the discriminator used by the profile-boards manager.
        isFeaturedOnProfile: true,
      },
    });
    const photo = await tx.boardPhoto.create({
      data: { boardId: board.id, s3Key, url, orderIndex: 0 },
    });
    await tx.stylistProfile.update({
      where: { id: profile.id },
      data: { profileMoodboardId: board.id },
    });
    return { boardId: board.id, photoId: photo.id };
  });
}
