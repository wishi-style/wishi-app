"use server";

import { getServerAuth } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/prisma";
import { persistMatchQuizAnswers } from "@/lib/quiz/engine";
import { mintGuestToken, readGuestToken } from "@/lib/auth/guest-token";

export type SubmitMatchQuizResult =
  | { ok: true; signedIn: true }
  | { ok: true; signedIn: false; guestToken: string };

export async function submitMatchQuiz(
  answers: Record<string, unknown>,
): Promise<SubmitMatchQuizResult> {
  // getServerAuth() rather than Clerk's auth() so the E2E_AUTH_MODE cookie
  // resolves the same way as in /stylist-match. Without this, an authed e2e
  // user falls through to the guest path and submitMatchQuiz returns
  // signedIn=false, opening the Clerk sign-up modal instead of redirecting.
  const { userId: clerkId } = await getServerAuth();

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
