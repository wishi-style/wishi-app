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
  return prisma.matchQuizResult.create({
    data: {
      userId,
      guestToken,
      genderToStyle: answers.gender_to_style as string | undefined
        ? (answers.gender_to_style as "MALE" | "FEMALE" | "NON_BINARY" | "PREFER_NOT_TO_SAY")
        : undefined,
      styleDirection: (answers.style_direction as string[]) ?? [],
      occasion: (answers.occasion as string) ?? null,
      budgetBracket: (answers.budget_bracket as string) ?? null,
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
