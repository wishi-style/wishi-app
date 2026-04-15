import { prisma } from "@/lib/prisma";
import type { QuizType, Prisma } from "@/generated/prisma/client";
import { routeFieldWrite } from "./field-router";

export async function getQuizWithQuestions(type: QuizType) {
  return prisma.quiz.findUnique({
    where: { type },
    include: {
      questions: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
}

export async function persistMatchQuizAnswers(
  answers: Record<string, unknown>,
  guestToken: string | null,
  userId: string | null
) {
  // QuizShell keys answers by the full fieldKey (e.g. "match_quiz_result.gender_to_style").
  // Normalize to bare keys for easy access.
  const bare: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(answers)) {
    const bareKey = key.includes(".") ? key.split(".").pop()! : key;
    bare[bareKey] = value;
  }

  return prisma.matchQuizResult.create({
    data: {
      userId,
      guestToken,
      genderToStyle: bare.gender_to_style as string | undefined
        ? (bare.gender_to_style as "MALE" | "FEMALE" | "NON_BINARY" | "PREFER_NOT_TO_SAY")
        : undefined,
      styleDirection: (bare.style_direction as string[]) ?? [],
      occasion: (bare.occasion as string) ?? null,
      budgetBracket: (bare.budget_bracket as string) ?? null,
      rawAnswers: answers as Prisma.InputJsonValue,
    },
  });
}

export async function persistStyleQuizAnswers(
  userId: string,
  answers: Record<string, unknown>
) {
  for (const [fieldKey, value] of Object.entries(answers)) {
    if (value !== undefined && value !== null && value !== "") {
      await routeFieldWrite(userId, fieldKey, value);
    }
  }
}
