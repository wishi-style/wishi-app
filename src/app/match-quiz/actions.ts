"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { persistMatchQuizAnswers } from "@/lib/quiz/engine";
import { mintGuestToken, readGuestToken } from "@/lib/auth/guest-token";

export type SubmitMatchQuizResult =
  | { ok: true; signedIn: true }
  | { ok: true; signedIn: false; guestToken: string };

export async function submitMatchQuiz(
  answers: Record<string, unknown>,
): Promise<SubmitMatchQuizResult> {
  const { userId: clerkId } = await auth();

  let userId: string | null = null;
  let guestToken: string | null = null;

  if (clerkId) {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    userId = user?.id ?? null;
  }

  // Either truly unauth, OR Clerk session exists but the user.created webhook
  // hasn't created the Prisma row yet (rare race during signup). Either way
  // we mint a guestToken so the quiz row is claimable when the DB row finally
  // shows up — the alternative is an orphaned MatchQuizResult with both
  // userId and guestToken null, which causes a redirect loop on /stylist-match.
  if (!userId) {
    guestToken = (await readGuestToken()) ?? (await mintGuestToken());
  }

  await persistMatchQuizAnswers(answers, guestToken, userId);

  if (userId) {
    return { ok: true, signedIn: true };
  }
  return { ok: true, signedIn: false, guestToken: guestToken! };
}
