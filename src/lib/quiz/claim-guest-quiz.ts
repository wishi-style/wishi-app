import { prisma } from "@/lib/prisma";

export async function claimGuestQuizResult(
  userId: string,
  guestToken: string | undefined | null,
) {
  if (!guestToken) return;

  await prisma.matchQuizResult.updateMany({
    where: {
      guestToken,
      userId: null,
    },
    data: {
      userId,
      claimedAt: new Date(),
    },
  });
}
