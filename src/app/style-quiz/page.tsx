import { redirect } from "next/navigation";
import { getQuizWithQuestions } from "@/lib/quiz/engine";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth/server-auth";
import { StyleQuizClient } from "./style-quiz-client";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ stylistId?: string }>;
}

/**
 * Post-match, pre-booking style profile builder. Required gate on both
 * funnel paths — match-quiz → stylist pick → style-quiz → book, and the
 * direct-from-stylist-profile flow that skips match-quiz entirely.
 *
 * Returning clients with a completed StyleProfile normally bypass this
 * via the CTA href on /stylists/[id]; if they still reach /style-quiz,
 * this page redirects them based on `quizCompletedAt` so they don't
 * re-answer 22 questions on every booking.
 */
export default async function StyleQuizPage({ searchParams }: Props) {
  const { stylistId } = await searchParams;
  const { userId: clerkId } = await getServerAuth();
  if (!clerkId) {
    const next = stylistId ? `/style-quiz?stylistId=${stylistId}` : "/style-quiz";
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: {
      id: true,
      styleProfile: { select: { quizCompletedAt: true } },
    },
  });

  if (!user) {
    const next = stylistId ? `/style-quiz?stylistId=${stylistId}` : "/style-quiz";
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }

  if (user.styleProfile?.quizCompletedAt) {
    if (stylistId) {
      redirect(`/bookings/new?stylistId=${encodeURIComponent(stylistId)}`);
    }
    redirect("/sessions");
  }

  const quiz = await getQuizWithQuestions("STYLE_PREFERENCE");
  if (!quiz || quiz.questions.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-stone-500">Quiz is not available yet.</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#FAF8F5]">
      <div className="mx-auto max-w-2xl">
        <StyleQuizClient
          questions={quiz.questions}
          stylistId={stylistId ?? null}
        />
      </div>
    </main>
  );
}
