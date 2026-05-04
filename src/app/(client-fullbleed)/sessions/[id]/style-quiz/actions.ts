"use server";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { persistStyleQuizAnswers } from "@/lib/quiz/engine";
import { hasCompletedStyleQuiz } from "@/lib/quiz/style-quiz-status";
import { redirect } from "next/navigation";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";

export async function submitStyleQuiz(
  sessionId: string,
  answers: Record<string, unknown>,
) {
  const user = await getCurrentAuthUser();
  if (!user) throw new Error("User not found");

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { clientId: true },
  });
  if (!session || session.clientId !== user.id) {
    throw new Error("Session not found");
  }

  // Idempotent guard. Shared with /chat and /sessions/[id] via
  // hasCompletedStyleQuiz so all three surfaces gate on the same field
  // (quizCompletedAt). An earlier inline shape gated on row existence,
  // which short-circuited partial-progress users into a chat-page → quiz
  // redirect loop.
  if (await hasCompletedStyleQuiz(user.id)) {
    redirect(`/sessions/${sessionId}/chat`);
  }

  try {
    await persistStyleQuizAnswers(user.id, answers);

    // Upsert (not update) — `persistStyleQuizAnswers` may not have created
    // a StyleProfile row if the user only answered fields owned by other
    // models (BodyProfile, ColorPreference, etc.). The standalone
    // submitStandaloneStyleQuiz already does this; mirror it here.
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
  } catch (err) {
    // Re-throw redirects (next/navigation throws a special error) untouched
    // so Next.js can act on them.
    if (isRedirectError(err)) throw err;
    // Surface the underlying Prisma / DB error to CloudWatch — production
    // hides the raw message from the client and the generic "Server
    // Components render" copy is unactionable without it.
    console.error(
      JSON.stringify({
        event: "style_quiz_submit_failed",
        sessionId,
        userId: user.id,
        answerKeys: Object.keys(answers),
        err: err instanceof Error ? err.message : String(err),
      }),
    );
    throw err;
  }

  redirect(`/sessions/${sessionId}/chat`);
}
