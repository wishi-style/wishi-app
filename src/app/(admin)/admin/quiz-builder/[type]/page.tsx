import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAdminQuiz } from "@/lib/quiz/admin.service";
import type { QuizType } from "@/generated/prisma/client";
import { QuizEditor } from "./editor";

export const dynamic = "force-dynamic";

const VALID_TYPES: QuizType[] = ["MATCH", "STYLE_PREFERENCE"];

export default async function AdminQuizBuilderDetail({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  if (!(VALID_TYPES as string[]).includes(type)) notFound();
  const quiz = await getAdminQuiz(type as QuizType);
  if (!quiz) {
    redirect("/admin/quiz-builder");
  }

  return (
    <div>
      <PageHeader
        title={quiz.title}
        description={`${quiz.type} · v${quiz.version} · ${quiz.questions.length} question${quiz.questions.length === 1 ? "" : "s"}`}
        actions={<Badge variant="outline">v{quiz.version}</Badge>}
      />
      <div className="mb-4">
        <Link
          href="/admin/quiz-builder"
          className={buttonVariants({ variant: "outline" })}
        >
          ← Back to quizzes
        </Link>
      </div>
      <QuizEditor
        quizType={quiz.type}
        initialQuestions={quiz.questions.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          helperText: q.helperText,
          questionType: q.questionType,
          isRequired: q.isRequired,
          fieldKey: q.fieldKey,
          isActive: q.isActive,
          options: q.options,
          metadata: q.metadata,
        }))}
      />
    </div>
  );
}
