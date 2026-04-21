import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { saveQuizDraft, normalizeQuizDraft } from "@/lib/quiz/admin.service";
import type { QuizType } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const VALID_TYPES: QuizType[] = ["MATCH", "STYLE_PREFERENCE"];

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ type: string }> },
) {
  const admin = await requireAdmin();
  const { type } = await params;
  if (!(VALID_TYPES as string[]).includes(type)) {
    return NextResponse.json({ error: "Invalid quiz type" }, { status: 400 });
  }

  const body = (await req.json()) as { questions?: unknown };

  let draft;
  try {
    draft = normalizeQuizDraft((body.questions as []) ?? []);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid payload" },
      { status: 400 },
    );
  }

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
