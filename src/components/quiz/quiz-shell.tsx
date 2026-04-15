"use client";

import { useState, useCallback } from "react";
import type { QuizQuestion } from "@/generated/prisma/client";
import {
  SingleSelectQuestion,
  MultiSelectQuestion,
  TextQuestion,
  ImagePickerQuestion,
} from "./question-renderers";

interface QuizShellProps {
  questions: QuizQuestion[];
  onComplete: (answers: Record<string, unknown>) => void;
  isSubmitting?: boolean;
}

export function QuizShell({ questions, onComplete, isSubmitting }: QuizShellProps) {
  const [step, setStep] = useState(0);
  // Pre-populate default answers for RANGE questions so they are valid without interaction
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => {
    const defaults: Record<string, unknown> = {};
    for (const q of questions) {
      if (q.questionType === "RANGE") {
        const meta = q.metadata as { min?: number; max?: number } | null;
        const min = meta?.min ?? 1;
        const max = meta?.max ?? 10;
        defaults[q.fieldKey] = Math.round((min + max) / 2);
      }
    }
    return defaults;
  });

  const current = questions[step];
  const isLast = step === questions.length - 1;
  const canAdvance = !current.isRequired || isAnswerValid(current.questionType, answers[current.fieldKey]);

  const setAnswer = useCallback(
    (value: unknown) => {
      setAnswers((prev) => ({ ...prev, [current.fieldKey]: value }));
    },
    [current.fieldKey]
  );

  function handleNext() {
    if (isLast) {
      onComplete(answers);
    } else {
      setStep((s) => s + 1);
    }
  }

  function handleBack() {
    if (step > 0) setStep((s) => s - 1);
  }

  const options = (current.options as { value: string; label: string; imageUrl?: string }[]) ?? [];

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-between px-4 py-12">
      {/* Progress */}
      <div className="mb-8 w-full">
        <div className="mb-2 flex items-center justify-between text-xs text-stone-400">
          <span>
            {step + 1} of {questions.length}
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-stone-200">
          <div
            className="h-full bg-black transition-all duration-300"
            style={{ width: `${((step + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <h2 className="mb-2 font-serif text-2xl font-light text-stone-900">
          {current.prompt}
        </h2>
        {current.helperText && (
          <p className="mb-8 text-sm text-stone-500">{current.helperText}</p>
        )}

        <div className="w-full">
          {current.questionType === "SINGLE_SELECT" && (
            <SingleSelectQuestion
              options={options}
              value={answers[current.fieldKey]}
              onChange={setAnswer}
            />
          )}
          {current.questionType === "MULTI_SELECT" && (
            <MultiSelectQuestion
              options={options}
              value={answers[current.fieldKey]}
              onChange={setAnswer}
            />
          )}
          {current.questionType === "TEXT" && (
            <div className="flex justify-center">
              <TextQuestion value={answers[current.fieldKey]} onChange={setAnswer} />
            </div>
          )}
          {current.questionType === "IMAGE_PICKER" && (
            <ImagePickerQuestion
              options={options}
              value={answers[current.fieldKey]}
              onChange={setAnswer}
            />
          )}
          {current.questionType === "RANGE" && (
            <RangeQuestion
              value={answers[current.fieldKey]}
              onChange={setAnswer}
              metadata={current.metadata as { min: number; max: number } | null}
            />
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-8 flex w-full items-center justify-between">
        <button
          type="button"
          onClick={handleBack}
          disabled={step === 0}
          className="rounded-full px-6 py-3 text-sm font-medium text-stone-500 transition-colors hover:text-stone-800 disabled:invisible"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={!canAdvance || isSubmitting}
          className="rounded-full bg-black px-8 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {isSubmitting ? "Submitting..." : isLast ? "See My Matches" : "Next"}
        </button>
      </div>
    </div>
  );
}

/** Returns true when the answer for a required question is considered valid. */
function isAnswerValid(questionType: string, answer: unknown): boolean {
  if (questionType === "MULTI_SELECT" || questionType === "IMAGE_PICKER") {
    return Array.isArray(answer) && answer.length > 0;
  }
  if (questionType === "RANGE") {
    return typeof answer === "number";
  }
  return answer !== undefined && answer !== "";
}

function RangeQuestion({
  value,
  onChange,
  metadata,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  metadata: { min: number; max: number } | null;
}) {
  const min = metadata?.min ?? 1;
  const max = metadata?.max ?? 10;
  const current = (value as number) ?? Math.round((min + max) / 2);

  return (
    <div className="flex flex-col items-center gap-4">
      <input
        type="range"
        min={min}
        max={max}
        value={current}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-64 accent-black"
      />
      <div className="flex w-64 justify-between text-xs text-stone-400">
        <span>{min} — Safe</span>
        <span className="text-lg font-medium text-stone-800">{current}</span>
        <span>Adventurous — {max}</span>
      </div>
    </div>
  );
}
