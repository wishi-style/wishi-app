import { prisma } from "@/lib/prisma";
import { getQuizWithQuestions } from "@/lib/quiz/engine";
import { redirect, notFound } from "next/navigation";
import { StyleQuizClient } from "./style-quiz-client";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function StyleQuizPage({ params }: Props) {
  const { id: sessionId } = await params;
  const user = await getCurrentAuthUser();
  if (!user) redirect("/sign-in");

  // Verify session ownership
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { clientId: true },
  });
  if (!session || session.clientId !== user.id) notFound();

  // Skip when already completed — the chat-page gate sends users here when
  // quizCompletedAt is null, so the matching condition gates the redirect
  // back into the session room.
  const existing = await prisma.styleProfile.findUnique({
    where: { userId: user.id },
    select: { quizCompletedAt: true },
  });
  if (existing?.quizCompletedAt) {
    redirect(`/sessions/${sessionId}/chat`);
  }

  const quiz = await getQuizWithQuestions("STYLE_PREFERENCE");
  if (!quiz || quiz.questions.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-stone-500">Style quiz is not available yet.</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#FAF8F5]">
      <div className="mx-auto max-w-2xl">
        <StyleQuizClient sessionId={sessionId} questions={quiz.questions} />
      </div>
    </main>
  );
}
