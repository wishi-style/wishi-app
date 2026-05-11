import { prisma } from "@/lib/prisma";
import { hasCompletedStyleQuiz } from "@/lib/quiz/style-quiz-status";
import { redirect, notFound } from "next/navigation";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import StyleQuizLoveable from "@/app/style-quiz/style-quiz-loveable";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Session-scoped style-quiz gate. Same Loveable component as the
 * standalone /style-quiz, just submits via the session ctx so the redirect
 * lands in the chat room instead of /stylists.
 */
export default async function StyleQuizPage({ params }: Props) {
  const { id: sessionId } = await params;
  const user = await getCurrentAuthUser();
  if (!user) redirect("/sign-in");

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { clientId: true },
  });
  if (!session || session.clientId !== user.id) notFound();

  if (await hasCompletedStyleQuiz(user.id)) {
    redirect(`/sessions/${sessionId}/chat`);
  }

  return (
    <StyleQuizLoveable
      ctx={{ kind: "session", sessionId }}
      userEmail={user.email}
    />
  );
}
