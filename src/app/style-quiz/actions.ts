"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth/server-auth";
import { persistStyleQuizAnswers } from "@/lib/quiz/engine";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Persist the Style Preference quiz for the current authed user, mark the
 * StyleProfile as completed, and redirect into the booking flow.
 *
 * `stylistId` is threaded through from the query-string so a user who
 * clicked "Continue with Mika" on /stylists/[id] lands back on the same
 * booking form they started from. When absent (e.g. user landed on
 * /style-quiz via a direct link), we send them to /sessions instead.
 */
export async function submitStyleQuiz(
  answers: Record<string, unknown>,
  stylistId: string | null,
) {
  const { userId: clerkId } = await getServerAuth();
  if (!clerkId) {
    redirect("/sign-in");
  }

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: {
      id: true,
      styleProfile: { select: { quizCompletedAt: true } },
    },
  });
  if (!user) {
    redirect("/sign-in");
  }

  // Idempotent — the page redirects completed users away, but a replay
  // (double-submit, stale tab, direct action call) must not overwrite the
  // original quizCompletedAt or stored answers.
  if (!user.styleProfile?.quizCompletedAt) {
    await persistStyleQuizAnswers(user.id, answers);
    const answersJson = answers as Prisma.InputJsonValue;
    await prisma.styleProfile.upsert({
      where: { userId: user.id },
      update: { quizCompletedAt: new Date(), quizAnswers: answersJson },
      create: {
        userId: user.id,
        quizCompletedAt: new Date(),
        quizAnswers: answersJson,
      },
    });
  }

  if (stylistId) {
    redirect(`/bookings/new?stylistId=${encodeURIComponent(stylistId)}`);
  }
  redirect("/sessions");
}
