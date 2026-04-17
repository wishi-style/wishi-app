import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { saveQuizDraft } from "@/lib/quiz/admin.service";
import type { QuizQuestionType, QuizType } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const VALID_TYPES: QuizType[] = ["MATCH", "STYLE_PREFERENCE"];

type IncomingQuestion = {
  id?: string;
  prompt?: unknown;
  helperText?: unknown;
  questionType?: unknown;
  isRequired?: unknown;
  fieldKey?: unknown;
  isActive?: unknown;
  options?: unknown;
  metadata?: unknown;
};

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ type: string }> },
) {
  const admin = await requireAdmin();
  const { type } = await params;
  if (!(VALID_TYPES as string[]).includes(type)) {
    return NextResponse.json({ error: "Invalid quiz type" }, { status: 400 });
  }

  const body = (await req.json()) as { questions?: IncomingQuestion[] };
  if (!Array.isArray(body.questions)) {
    return NextResponse.json(
      { error: "questions[] required" },
      { status: 400 },
    );
  }

  const draft = body.questions.map((q, i) => {
    const prompt = typeof q.prompt === "string" ? q.prompt.trim() : "";
    const fieldKey = typeof q.fieldKey === "string" ? q.fieldKey.trim() : "";
    if (!prompt || !fieldKey) {
      throw new Error(`Question ${i + 1} missing prompt or fieldKey`);
    }
    return {
      id: q.id,
      prompt,
      helperText: typeof q.helperText === "string" ? q.helperText : null,
      questionType: q.questionType as QuizQuestionType,
      isRequired: Boolean(q.isRequired),
      fieldKey,
      isActive: q.isActive !== false,
      options: q.options ?? null,
      metadata: q.metadata ?? null,
    };
  });

  try {
    await saveQuizDraft({
      type: type as QuizType,
      draft,
      actorUserId: admin.userId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Save failed" },
      { status: 400 },
    );
  }
}
