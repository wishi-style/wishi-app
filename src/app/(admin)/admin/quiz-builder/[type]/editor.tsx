"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Plus } from "lucide-react";
import { nanoid } from "nanoid";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { QuizQuestionType, QuizType } from "@/generated/prisma/client";

type DraftQuestion = {
  localId: string;
  id?: string;
  prompt: string;
  helperText: string | null;
  questionType: QuizQuestionType;
  isRequired: boolean;
  fieldKey: string;
  isActive: boolean;
  options: unknown;
  metadata: unknown;
};

const QUESTION_TYPES: QuizQuestionType[] = [
  "SINGLE_SELECT",
  "MULTI_SELECT",
  "TEXT",
  "NUMBER",
  "RANGE",
  "IMAGE_PICKER",
];

function fromServer(
  qs: Array<Omit<DraftQuestion, "localId"> & { id: string }>,
): DraftQuestion[] {
  return qs.map((q) => ({ ...q, localId: q.id }));
}

export function QuizEditor({
  quizType,
  initialQuestions,
}: {
  quizType: QuizType;
  initialQuestions: Array<
    Omit<DraftQuestion, "localId" | "id"> & { id: string }
  >;
}) {
  const router = useRouter();
  const [questions, setQuestions] = useState<DraftQuestion[]>(() =>
    fromServer(initialQuestions),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor));

  const itemIds = useMemo(() => questions.map((q) => q.localId), [questions]);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = questions.findIndex((q) => q.localId === active.id);
    const newIndex = questions.findIndex((q) => q.localId === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setQuestions((prev) => arrayMove(prev, oldIndex, newIndex));
  }

  function patch(localId: string, partial: Partial<DraftQuestion>) {
    setQuestions((prev) =>
      prev.map((q) => (q.localId === localId ? { ...q, ...partial } : q)),
    );
  }

  function addQuestion() {
    setQuestions((prev) => [
      ...prev,
      {
        localId: nanoid(),
        prompt: "",
        helperText: null,
        questionType: "SINGLE_SELECT",
        isRequired: false,
        fieldKey: "",
        isActive: true,
        options: null,
        metadata: null,
      },
    ]);
  }

  function removeQuestion(localId: string) {
    setQuestions((prev) => prev.filter((q) => q.localId !== localId));
  }

  async function save() {
    setError(null);
    const invalid = questions.find(
      (q) => !q.prompt.trim() || !q.fieldKey.trim(),
    );
    if (invalid) {
      setError("Every question needs a prompt and a fieldKey.");
      return;
    }

    setSaving(true);
    try {
      const body = {
        questions: questions.map((q) => ({
          id: q.id,
          prompt: q.prompt.trim(),
          helperText: q.helperText?.trim() || null,
          questionType: q.questionType,
          isRequired: q.isRequired,
          fieldKey: q.fieldKey.trim(),
          isActive: q.isActive,
          options: q.options,
          metadata: q.metadata,
        })),
      };
      const res = await fetch(`/api/admin/quiz/${quizType}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        setError(err.error ?? "Save failed");
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Questions</h2>
          <div className="flex gap-2">
            <Button variant="outline" onClick={addQuestion}>
              <Plus className="size-4" /> Add question
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save & publish"}
            </Button>
          </div>
        </div>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {questions.map((q, i) => (
                <SortableQuestionCard
                  key={q.localId}
                  index={i}
                  question={q}
                  onPatch={(partial) => patch(q.localId, partial)}
                  onRemove={() => removeQuestion(q.localId)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <div>
        <Card className="sticky top-4">
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>
              Reflects the in-memory draft. Saving bumps Quiz.version and
              replaces the live quiz immediately.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {questions.length === 0 ? (
              <p className="text-muted-foreground">No questions yet.</p>
            ) : (
              questions.map((q, i) => (
                <div
                  key={q.localId}
                  className="rounded-md border border-border bg-muted/30 p-2"
                >
                  <div className="text-xs text-muted-foreground">
                    {i + 1}. {q.questionType}
                    {q.isRequired ? " · required" : ""}
                  </div>
                  <div className="font-medium">
                    {q.prompt || (
                      <span className="text-muted-foreground">
                        (no prompt)
                      </span>
                    )}
                  </div>
                  {q.helperText ? (
                    <div className="text-xs text-muted-foreground">
                      {q.helperText}
                    </div>
                  ) : null}
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {q.fieldKey || "(no fieldKey)"}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SortableQuestionCard({
  question,
  index,
  onPatch,
  onRemove,
}: {
  question: DraftQuestion;
  index: number;
  onPatch: (patch: Partial<DraftQuestion>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: question.localId });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const optionsText = useMemo(() => {
    if (question.options === null || question.options === undefined) return "";
    try {
      return JSON.stringify(question.options, null, 2);
    } catch {
      return "";
    }
  }, [question.options]);

  return (
    <div ref={setNodeRef} style={style}>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
          <button
            className="mt-1 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
          >
            <GripVertical className="size-4" />
          </button>
          <div className="flex-1">
            <Badge variant="outline" className="mb-1">
              #{index + 1}
            </Badge>
            <Input
              placeholder="Question prompt"
              value={question.prompt}
              onChange={(e) => onPatch({ prompt: e.target.value })}
            />
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            aria-label="Remove"
          >
            <Trash2 className="size-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-1">
            <Label>Helper text</Label>
            <Input
              placeholder="Optional guidance shown below the prompt"
              value={question.helperText ?? ""}
              onChange={(e) =>
                onPatch({ helperText: e.target.value || null })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Question type</Label>
              <Select
                value={question.questionType}
                onValueChange={(v) =>
                  v && onPatch({ questionType: v as QuizQuestionType })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUESTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replace(/_/g, " ").toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Field key</Label>
              <Input
                placeholder="e.g. match_quiz_result.gender_to_style"
                value={question.fieldKey}
                onChange={(e) => onPatch({ fieldKey: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <Switch
                checked={question.isRequired}
                onCheckedChange={(v) => onPatch({ isRequired: v })}
              />
              <span className="text-xs">Required</span>
            </label>
            <label className="flex items-center gap-2">
              <Switch
                checked={question.isActive}
                onCheckedChange={(v) => onPatch({ isActive: v })}
              />
              <span className="text-xs">Active</span>
            </label>
          </div>
          <div className="space-y-1">
            <Label>Options (JSON)</Label>
            <Textarea
              rows={3}
              placeholder='e.g. ["bold","minimal","classic"] or [{"value":"m","label":"Male"}]'
              value={optionsText}
              onChange={(e) => {
                const raw = e.target.value.trim();
                if (!raw) {
                  onPatch({ options: null });
                  return;
                }
                try {
                  onPatch({ options: JSON.parse(raw) });
                } catch {
                  // Keep the string as raw until it parses; we don't patch.
                }
              }}
              className="font-mono text-xs"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
