import { redirect } from "next/navigation";
import { hasCompletedStyleQuiz } from "@/lib/quiz/style-quiz-status";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import StyleQuizLoveable from "./style-quiz-loveable";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ return?: string }>;
}

/**
 * Loveable's pre-booking style-quiz gate. Required from /stylists/[id]
 * Continue CTA before a user can book. Returning clients with
 * `StyleProfile.quizCompletedAt` bypass straight to wherever sent them.
 * Unauth'd users sign in first.
 *
 * Body is a verbatim port of `smart-spark-craft/src/pages/StyleQuiz.tsx`.
 * The pre-2026-05 DB-driven shell is gone; the admin quiz-builder now
 * only manages MATCH.
 */
export default async function StandaloneStyleQuizPage({ searchParams }: Props) {
  const params = await searchParams;
  const returnPath = params.return ?? null;

  const user = await getCurrentAuthUser();
  if (!user) {
    const next = `/style-quiz${returnPath ? `?return=${encodeURIComponent(returnPath)}` : ""}`;
    redirect(`/sign-in?redirect=${encodeURIComponent(next)}`);
  }

  if (await hasCompletedStyleQuiz(user.id)) {
    redirect(safeReturn(returnPath));
  }

  return (
    <StyleQuizLoveable
      ctx={{ kind: "standalone", returnPath: returnPath ?? undefined }}
      userEmail={user.email}
    />
  );
}

function safeReturn(returnPath: string | null): string {
  if (!returnPath) return "/stylists";
  if (!returnPath.startsWith("/")) return "/stylists";
  if (returnPath.startsWith("//")) return "/stylists";
  return returnPath;
}
