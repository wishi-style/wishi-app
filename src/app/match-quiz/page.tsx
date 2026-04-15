import { getQuizWithQuestions } from "@/lib/quiz/engine";
import { MatchQuizClient } from "./match-quiz-client";

export const dynamic = "force-dynamic";

export default async function MatchQuizPage() {
  const quiz = await getQuizWithQuestions("MATCH");

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
        <MatchQuizClient questions={quiz.questions} />
      </div>
    </main>
  );
}
