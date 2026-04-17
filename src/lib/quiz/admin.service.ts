import { prisma } from "@/lib/prisma";
import type { Prisma, QuizQuestionType, QuizType } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit/log";

export type QuizDraftQuestion = {
  id?: string;
  prompt: string;
  helperText?: string | null;
  questionType: QuizQuestionType;
  isRequired: boolean;
  options?: unknown;
  metadata?: unknown;
  fieldKey: string;
  isActive: boolean;
};

export async function getAdminQuiz(type: QuizType) {
  return prisma.quiz.findUnique({
    where: { type },
    include: {
      questions: { orderBy: { sortOrder: "asc" } },
    },
  });
}

export async function listAdminQuizzes() {
  return prisma.quiz.findMany({
    orderBy: { type: "asc" },
    include: {
      _count: { select: { questions: true } },
    },
  });
}

export async function saveQuizDraft({
  type,
  draft,
  actorUserId,
}: {
  type: QuizType;
  draft: QuizDraftQuestion[];
  actorUserId: string;
}) {
  const quiz = await prisma.quiz.findUnique({
    where: { type },
    include: { questions: { select: { id: true } } },
  });
  if (!quiz) throw new Error(`Quiz ${type} not found`);

  const draftIds = new Set(draft.map((d) => d.id).filter(Boolean) as string[]);

  await prisma.$transaction(async (tx) => {
    // 1. Temp-offset existing sortOrders so the unique constraint never conflicts during rewrite.
    for (let i = 0; i < quiz.questions.length; i++) {
      await tx.quizQuestion.update({
        where: { id: quiz.questions[i].id },
        data: { sortOrder: 100_000 + i },
      });
    }

    // 2. Delete removed questions.
    const toDelete = quiz.questions.filter((q) => !draftIds.has(q.id));
    if (toDelete.length) {
      await tx.quizQuestion.deleteMany({
        where: { id: { in: toDelete.map((q) => q.id) } },
      });
    }

    // 3. Upsert each draft row at its target sortOrder.
    for (let i = 0; i < draft.length; i++) {
      const d = draft[i];
      const data = {
        prompt: d.prompt,
        helperText: d.helperText ?? null,
        questionType: d.questionType,
        isRequired: d.isRequired,
        options: (d.options ?? null) as Prisma.InputJsonValue,
        metadata: (d.metadata ?? null) as Prisma.InputJsonValue,
        fieldKey: d.fieldKey,
        isActive: d.isActive,
        sortOrder: i,
      };
      if (d.id) {
        await tx.quizQuestion.update({ where: { id: d.id }, data });
      } else {
        await tx.quizQuestion.create({
          data: { ...data, quizId: quiz.id },
        });
      }
    }

    // 4. Bump version.
    await tx.quiz.update({
      where: { id: quiz.id },
      data: { version: { increment: 1 } },
    });
  });

  await writeAudit({
    actorUserId,
    action: "quiz.publish",
    entityType: "Quiz",
    entityId: quiz.id,
    meta: { type, questionCount: draft.length },
  });
}
