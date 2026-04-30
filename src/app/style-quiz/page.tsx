import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getQuizWithQuestions } from "@/lib/quiz/engine";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { StandaloneStyleQuizClient } from "./style-quiz-client";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ return?: string }>;
}

/**
 * Top-level /style-quiz route — Loveable's pre-booking gate. Required from
 * /stylists/[id] Continue CTA before a user can book. Returning clients
 * with `StyleProfile.quizCompletedAt` bypass straight to wherever sent
 * them. Unauth'd users sign in first.
 *
 * Per locked decision (2026-04-22): we don't port Loveable's 1017-line
 * hardcoded questionnaire — the body uses our DB-driven STYLE_PREFERENCE
 * quiz shell, but the route itself exists at the same URL Loveable uses.
 */
export default async function StandaloneStyleQuizPage({ searchParams }: Props) {
  const params = await searchParams;
  const returnPath = params.return ?? null;

  const user = await getCurrentAuthUser();
  if (!user) {
    const next = `/style-quiz${returnPath ? `?return=${encodeURIComponent(returnPath)}` : ""}`;
    redirect(`/sign-in?redirect=${encodeURIComponent(next)}`);
  }

  // Returning clients skip the quiz — Loveable's contract is "ask once".
  const existing = await prisma.styleProfile.findUnique({
    where: { userId: user.id },
    select: { quizCompletedAt: true },
  });
  if (existing?.quizCompletedAt) {
    redirect(safeReturn(returnPath));
  }

  const quiz = await getQuizWithQuestions("STYLE_PREFERENCE");
  if (!quiz || quiz.questions.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="font-body text-sm text-muted-foreground">
          Style quiz is not available yet.
        </p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-5">
          <h1 className="font-display text-xl tracking-tight">
            Your Style Profile
          </h1>
        </div>
      </header>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <StandaloneStyleQuizClient
          questions={quiz.questions}
          returnPath={returnPath}
        />
      </div>
    </main>
  );
}

function safeReturn(returnPath: string | null): string {
  if (!returnPath) return "/stylists";
  if (!returnPath.startsWith("/")) return "/stylists";
  if (returnPath.startsWith("//")) return "/stylists";
  return returnPath;
}
