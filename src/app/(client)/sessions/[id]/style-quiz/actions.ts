"use server";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { persistStyleQuizAnswers } from "@/lib/quiz/engine";
import { redirect } from "next/navigation";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";

export async function submitStyleQuiz(sessionId: string, answers: Record<string, unknown>) {
  const user = await getCurrentAuthUser();
  if (!user) throw new Error("User not found");

  // Verify session ownership
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { clientId: true },
  });
  if (!session || session.clientId !== user.id) {
    throw new Error("Session not found");
  }

  // Check if StyleProfile already exists
  const existing = await prisma.styleProfile.findUnique({
    where: { userId: user.id },
  });
  if (existing) {
    redirect(`/sessions/${sessionId}/chat`);
  }

  // Persist all answers via field router
  await persistStyleQuizAnswers(user.id, answers);

  // Mark quiz as completed
  await prisma.styleProfile.update({
    where: { userId: user.id },
    data: { quizCompletedAt: new Date(), quizAnswers: answers as Prisma.InputJsonValue },
  });

  redirect(`/sessions/${sessionId}/chat`);
}
