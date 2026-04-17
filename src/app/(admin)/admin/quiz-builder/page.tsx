import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listAdminQuizzes } from "@/lib/quiz/admin.service";

export const dynamic = "force-dynamic";

export default async function AdminQuizBuilderIndex() {
  const quizzes = await listAdminQuizzes();
  return (
    <div>
      <PageHeader
        title="Quiz builder"
        description="Edit quiz questions without redeploying. Saves bump Quiz.version."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {quizzes.map((q) => (
          <Link key={q.id} href={`/admin/quiz-builder/${q.type}`}>
            <Card className="transition-colors hover:bg-muted/40">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{q.title}</CardTitle>
                    <CardDescription>
                      {q.type} · v{q.version}
                    </CardDescription>
                  </div>
                  <Badge variant={q.isActive ? "default" : "outline"}>
                    {q.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {q._count.questions} question
                {q._count.questions === 1 ? "" : "s"}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
