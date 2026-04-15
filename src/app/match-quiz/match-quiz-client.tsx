"use client";

import { useState, useTransition } from "react";
import type { QuizQuestion } from "@/generated/prisma/client";
import { QuizShell } from "@/components/quiz/quiz-shell";
import { submitMatchQuiz } from "./actions";

interface Props {
  questions: QuizQuestion[];
}

export function MatchQuizClient({ questions }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleComplete(answers: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await submitMatchQuiz(answers);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <>
      <QuizShell
        questions={questions}
        onComplete={handleComplete}
        isSubmitting={isPending}
      />
      {error && (
        <p className="mx-auto max-w-md text-center text-sm text-red-600">
          {error}
        </p>
      )}
    </>
  );
}
