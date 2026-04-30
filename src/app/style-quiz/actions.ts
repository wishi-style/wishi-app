"use server";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { persistStyleQuizAnswers } from "@/lib/quiz/engine";
import { redirect } from "next/navigation";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";

/**
 * Stand-alone style-quiz submission. Loveable's `/style-quiz` is a
 * pre-booking gate — the user lands here from /stylists/[id] before they
 * can book. On completion we mark StyleProfile.quizCompletedAt + write
 * answers via the field router, then redirect to whatever sent them
 * (`return` query param) or fall back to /stylists. The session-scoped
 * variant lives at /sessions/[id]/style-quiz and redirects into the chat
 * room instead.
 */
export async function submitStandaloneStyleQuiz(
  answers: Record<string, unknown>,
  returnPath?: string,
) {
  const user = await getCurrentAuthUser();
  if (!user) throw new Error("User not found");

  // Idempotent: if the quiz already completed, just redirect — no need to
  // overwrite a returning client's answers. The page-level gate also
  // bypasses but this defends against stale client state.
  const existing = await prisma.styleProfile.findUnique({
    where: { userId: user.id },
    select: { quizCompletedAt: true },
  });
  if (existing?.quizCompletedAt) {
    redirect(safeReturn(returnPath));
  }

  await persistStyleQuizAnswers(user.id, answers);

  await prisma.styleProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      quizCompletedAt: new Date(),
      quizAnswers: answers as Prisma.InputJsonValue,
    },
    update: {
      quizCompletedAt: new Date(),
      quizAnswers: answers as Prisma.InputJsonValue,
    },
  });

  redirect(safeReturn(returnPath));
}

// Loveable redirects users somewhere generic after the quiz. Restrict to
// known internal paths so a malicious `?return=` can't be turned into an
// open-redirect.
function safeReturn(returnPath: string | undefined): string {
  if (!returnPath) return "/stylists";
  if (!returnPath.startsWith("/")) return "/stylists";
  if (returnPath.startsWith("//")) return "/stylists";
  return returnPath;
}
