"use client";

import { useState, useTransition } from "react";
import type { QuizQuestion } from "@/generated/prisma/client";
import { QuizShell } from "@/components/quiz/quiz-shell";
import { submitStyleQuiz } from "./actions";

interface Props {
  sessionId: string;
  questions: QuizQuestion[];
}

export function StyleQuizClient({ sessionId, questions }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleComplete(answers: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await submitStyleQuiz(sessionId, answers);
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
        <p className="mx-auto max-w-md text-center text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  );
}
