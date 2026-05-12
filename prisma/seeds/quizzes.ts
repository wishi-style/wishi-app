import { PrismaClient } from "../../src/generated/prisma/client";

export async function seedQuizzes(prisma: PrismaClient) {
  // --- Match Quiz ---
  const matchQuiz = await prisma.quiz.upsert({
    where: { type: "MATCH" },
    update: { title: "Find Your Stylist" },
    create: {
      type: "MATCH",
      title: "Find Your Stylist",
      description: "A quick quiz to match you with the perfect stylist.",
      isActive: true,
    },
  });

  const matchQuestions = [
    {
      prompt: "Who are you shopping for?",
      questionType: "SINGLE_SELECT" as const,
      isRequired: true,
      sortOrder: 1,
      fieldKey: "match_quiz_result.gender_to_style",
      options: [
        { value: "FEMALE", label: "Women" },
        { value: "MALE", label: "Men" },
        { value: "NON_BINARY", label: "Non-Binary" },
      ],
    },
    {
      prompt: "What styles speak to you?",
      helperText: "Pick all that apply",
      questionType: "MULTI_SELECT" as const,
      isRequired: true,
      sortOrder: 2,
      fieldKey: "match_quiz_result.style_direction",
      options: [
        { value: "classic", label: "Classic", imageUrl: null },
        { value: "minimalist", label: "Minimalist", imageUrl: null },
        { value: "bohemian", label: "Bohemian", imageUrl: null },
        { value: "edgy", label: "Edgy", imageUrl: null },
        { value: "streetwear", label: "Streetwear", imageUrl: null },
        { value: "romantic", label: "Romantic", imageUrl: null },
        { value: "preppy", label: "Preppy", imageUrl: null },
      ],
    },
    {
      prompt: "What's the occasion?",
      questionType: "SINGLE_SELECT" as const,
      isRequired: true,
      sortOrder: 3,
      fieldKey: "match_quiz_result.occasion",
      options: [
        { value: "everyday", label: "Everyday" },
        { value: "workwear", label: "Work" },
        { value: "vacation", label: "Vacation" },
        { value: "date_night", label: "Date Night" },
        { value: "special_event", label: "Special Event" },
        { value: "full_wardrobe", label: "Full Wardrobe Refresh" },
      ],
    },
    {
      prompt: "What's your typical budget per item?",
      questionType: "SINGLE_SELECT" as const,
      isRequired: true,
      sortOrder: 4,
      fieldKey: "match_quiz_result.budget_bracket",
      options: [
        { value: "value", label: "Under $50" },
        { value: "mid", label: "$50–$150" },
        { value: "premium", label: "$150–$400" },
        { value: "luxury", label: "$400+" },
      ],
    },
  ];

  for (const q of matchQuestions) {
    await prisma.quizQuestion.upsert({
      where: {
        quizId_sortOrder: { quizId: matchQuiz.id, sortOrder: q.sortOrder },
      },
      update: {
        prompt: q.prompt,
        helperText: q.helperText ?? undefined,
        questionType: q.questionType,
        isRequired: q.isRequired,
        fieldKey: q.fieldKey,
        options: q.options,
      },
      create: {
        quizId: matchQuiz.id,
        ...q,
      },
    });
  }

  console.log(`  ✓ Match Quiz seeded (${matchQuestions.length} questions)`);

  // The STYLE_PREFERENCE quiz is no longer seeded — `/style-quiz` is now a
  // verbatim port of Loveable's hardcoded 26-step component. Any historical
  // STYLE_PREFERENCE rows are deleted so the admin quiz-builder UI doesn't
  // accidentally serve them.
  await prisma.quiz.deleteMany({ where: { type: "STYLE_PREFERENCE" } });
  console.log(`  ✓ Legacy STYLE_PREFERENCE quiz rows cleared`);
}
