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
  } else {
    guestToken = await readGuestToken();
    if (!guestToken) {
      guestToken = await mintGuestToken();
    }
  }

  await persistMatchQuizAnswers(answers, guestToken, userId);

  if (clerkId) {
    return { ok: true, signedIn: true };
  }
  return { ok: true, signedIn: false, guestToken: guestToken! };
}
