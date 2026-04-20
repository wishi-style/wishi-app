import assert from "node:assert/strict";
import test from "node:test";
import { normalizeQuizDraft } from "@/lib/quiz/admin.service";

test("normalizes a valid single-question payload", () => {
  const draft = normalizeQuizDraft([
    {
      prompt: "What styles do you lean toward?",
      helperText: "Pick up to three",
      questionType: "MULTI_SELECT",
      isRequired: true,
      fieldKey: "match_quiz_result.style_direction",
      options: ["bold", "minimal", "classic"],
    },
  ]);
  assert.equal(draft.length, 1);
  assert.deepEqual(draft[0], {
    id: undefined,
    prompt: "What styles do you lean toward?",
    helperText: "Pick up to three",
    questionType: "MULTI_SELECT",
    isRequired: true,
    fieldKey: "match_quiz_result.style_direction",
    isActive: true,
    options: ["bold", "minimal", "classic"],
    metadata: null,
  });
});

test("trims surrounding whitespace on prompt, helperText, fieldKey", () => {
  const [row] = normalizeQuizDraft([
    {
      prompt: "  Hello  ",
      helperText: "  hint  ",
      questionType: "TEXT",
      fieldKey: "  user.display_name  ",
    },
  ]);
  assert.equal(row.prompt, "Hello");
  assert.equal(row.helperText, "hint");
  assert.equal(row.fieldKey, "user.display_name");
});

test("nulls out empty helperText", () => {
  const [row] = normalizeQuizDraft([
    {
      prompt: "?",
      helperText: "   ",
      questionType: "TEXT",
      fieldKey: "x.y",
    },
  ]);
  assert.equal(row.helperText, null);
});

test("isActive defaults to true, isRequired defaults to false", () => {
  const [row] = normalizeQuizDraft([
    { prompt: "?", questionType: "TEXT", fieldKey: "x.y" },
  ]);
  assert.equal(row.isActive, true);
  assert.equal(row.isRequired, false);
});

test("isActive=false is honoured", () => {
  const [row] = normalizeQuizDraft([
    {
      prompt: "?",
      questionType: "TEXT",
      fieldKey: "x.y",
      isActive: false,
    },
  ]);
  assert.equal(row.isActive, false);
});

test("throws with 1-indexed position when prompt missing", () => {
  assert.throws(
    () =>
      normalizeQuizDraft([
        { prompt: "first", questionType: "TEXT", fieldKey: "x.y" },
        { prompt: "   ", questionType: "TEXT", fieldKey: "x.y" },
      ]),
    /Question 2 missing prompt/,
  );
});

test("throws when fieldKey missing", () => {
  assert.throws(
    () =>
      normalizeQuizDraft([
        { prompt: "ok", questionType: "TEXT", fieldKey: "" },
      ]),
    /Question 1 missing fieldKey/,
  );
});

test("throws on invalid questionType", () => {
  assert.throws(
    () =>
      normalizeQuizDraft([
        {
          prompt: "ok",
          questionType: "NOT_A_TYPE",
          fieldKey: "x.y",
        },
      ]),
    /invalid questionType/,
  );
});

test("rejects non-array input", () => {
  assert.throws(
    () => normalizeQuizDraft("nope" as unknown as never),
    /questions\[\] required/,
  );
});

test("preserves id when provided (edit path)", () => {
  const [row] = normalizeQuizDraft([
    {
      id: "qq_existing_abc",
      prompt: "?",
      questionType: "TEXT",
      fieldKey: "x.y",
    },
  ]);
  assert.equal(row.id, "qq_existing_abc");
});
