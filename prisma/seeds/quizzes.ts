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
        { value: "minimal", label: "Minimalist", imageUrl: null },
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

  // --- Style Preference Quiz ---
  const styleQuiz = await prisma.quiz.upsert({
    where: { type: "STYLE_PREFERENCE" },
    update: { title: "Style Preferences" },
    create: {
      type: "STYLE_PREFERENCE",
      title: "Style Preferences",
      description:
        "Tell your stylist everything about your style, body, and budget preferences.",
      isActive: true,
    },
  });

  const styleQuestions = [
    {
      prompt: "How would you describe your personal style?",
      questionType: "MULTI_SELECT" as const,
      isRequired: true,
      sortOrder: 1,
      fieldKey: "style_profile.style_preferences",
      options: [
        { value: "classic", label: "Classic" },
        { value: "minimalist", label: "Minimalist" },
        { value: "bohemian", label: "Bohemian" },
        { value: "edgy", label: "Edgy" },
        { value: "romantic", label: "Romantic" },
        { value: "streetwear", label: "Streetwear" },
        { value: "preppy", label: "Preppy" },
        { value: "athleisure", label: "Athleisure" },
      ],
    },
    {
      prompt: "Any style icons or inspirations?",
      helperText: "Names, celebrities, influencers — anything goes",
      questionType: "TEXT" as const,
      isRequired: false,
      sortOrder: 2,
      fieldKey: "style_profile.style_icons",
    },
    {
      prompt: "How adventurous do you want your stylist to be?",
      helperText: "1 = Keep it safe, 10 = Push my boundaries",
      questionType: "RANGE" as const,
      isRequired: true,
      sortOrder: 3,
      fieldKey: "style_profile.comfort_zone_level",
      metadata: { min: 1, max: 10 },
    },
    {
      prompt: "What's your dress code?",
      questionType: "SINGLE_SELECT" as const,
      isRequired: true,
      sortOrder: 4,
      fieldKey: "style_profile.dress_code",
      options: [
        { value: "casual", label: "Casual" },
        { value: "business_casual", label: "Business Casual" },
        { value: "denim_friendly", label: "Denim-Friendly Workplace" },
        { value: "formal", label: "Formal / Corporate" },
        { value: "creative", label: "Creative / No Code" },
      ],
    },
    {
      prompt: "What do you do for work?",
      questionType: "TEXT" as const,
      isRequired: false,
      sortOrder: 5,
      fieldKey: "style_profile.occupation",
    },
    {
      prompt: "What do you typically wear day-to-day?",
      questionType: "TEXT" as const,
      isRequired: false,
      sortOrder: 6,
      fieldKey: "style_profile.typically_wears",
    },
    {
      prompt: "What are you looking for from your stylist?",
      helperText: "Describe what you need — a workwear wardrobe, date night outfits, etc.",
      questionType: "TEXT" as const,
      isRequired: false,
      sortOrder: 7,
      fieldKey: "style_profile.needs_description",
    },
    {
      prompt: "What's your body type?",
      questionType: "SINGLE_SELECT" as const,
      isRequired: false,
      sortOrder: 8,
      fieldKey: "body_profile.body_type",
      options: [
        { value: "hourglass", label: "Hourglass" },
        { value: "pear", label: "Pear" },
        { value: "apple", label: "Apple" },
        { value: "rectangle", label: "Rectangle" },
        { value: "athletic", label: "Athletic" },
        { value: "inverted_triangle", label: "Inverted Triangle" },
      ],
    },
    {
      prompt: "Any body concerns your stylist should know about?",
      helperText: "Areas you'd like to highlight or minimize",
      questionType: "TEXT" as const,
      isRequired: false,
      sortOrder: 9,
      fieldKey: "body_profile.body_issues",
    },
    {
      prompt: "Which areas would you like to highlight?",
      questionType: "MULTI_SELECT" as const,
      isRequired: false,
      sortOrder: 10,
      fieldKey: "body_profile.highlight_areas",
      options: [
        { value: "shoulders", label: "Shoulders" },
        { value: "arms", label: "Arms" },
        { value: "waist", label: "Waist" },
        { value: "hips", label: "Hips" },
        { value: "legs", label: "Legs" },
        { value: "bust", label: "Bust" },
      ],
    },
    {
      prompt: "How tall are you?",
      questionType: "TEXT" as const,
      isRequired: false,
      sortOrder: 11,
      fieldKey: "body_profile.height",
    },
    {
      prompt: "How do you like your tops to fit?",
      questionType: "SINGLE_SELECT" as const,
      isRequired: false,
      sortOrder: 12,
      fieldKey: "body_profile.top_fit",
      options: [
        { value: "SLIM", label: "Slim" },
        { value: "REGULAR", label: "Regular" },
        { value: "RELAXED", label: "Relaxed" },
        { value: "OVERSIZED", label: "Oversized" },
      ],
    },
    {
      prompt: "How do you like your bottoms to fit?",
      questionType: "SINGLE_SELECT" as const,
      isRequired: false,
      sortOrder: 13,
      fieldKey: "body_profile.bottom_fit",
      options: [
        { value: "SLIM", label: "Slim" },
        { value: "REGULAR", label: "Regular" },
        { value: "RELAXED", label: "Relaxed" },
        { value: "OVERSIZED", label: "Oversized" },
      ],
    },
    {
      prompt: "What colors do you love?",
      helperText: "Pick all the colors you gravitate toward",
      questionType: "MULTI_SELECT" as const,
      isRequired: false,
      sortOrder: 14,
      fieldKey: "color_preference.liked",
      options: [
        { value: "black", label: "Black" },
        { value: "white", label: "White" },
        { value: "navy", label: "Navy" },
        { value: "grey", label: "Grey" },
        { value: "beige", label: "Beige" },
        { value: "blush", label: "Blush" },
        { value: "red", label: "Red" },
        { value: "green", label: "Green" },
        { value: "blue", label: "Blue" },
        { value: "burgundy", label: "Burgundy" },
        { value: "camel", label: "Camel" },
      ],
    },
    {
      prompt: "Any colors you absolutely avoid?",
      questionType: "MULTI_SELECT" as const,
      isRequired: false,
      sortOrder: 15,
      fieldKey: "color_preference.disliked",
      options: [
        { value: "neon", label: "Neon" },
        { value: "orange", label: "Orange" },
        { value: "yellow", label: "Yellow" },
        { value: "purple", label: "Purple" },
        { value: "pink", label: "Pink" },
        { value: "brown", label: "Brown" },
      ],
    },
    {
      prompt: "Any fabrics you dislike?",
      questionType: "MULTI_SELECT" as const,
      isRequired: false,
      sortOrder: 16,
      fieldKey: "fabric_preference.disliked",
      options: [
        { value: "polyester", label: "Polyester" },
        { value: "acrylic", label: "Acrylic" },
        { value: "wool", label: "Wool" },
        { value: "silk", label: "Silk" },
        { value: "leather", label: "Leather" },
        { value: "linen", label: "Linen" },
      ],
    },
    {
      prompt: "Any patterns you dislike?",
      questionType: "MULTI_SELECT" as const,
      isRequired: false,
      sortOrder: 17,
      fieldKey: "pattern_preference.disliked",
      options: [
        { value: "floral", label: "Floral" },
        { value: "stripes", label: "Stripes" },
        { value: "plaid", label: "Plaid" },
        { value: "animal_print", label: "Animal Print" },
        { value: "polka_dots", label: "Polka Dots" },
        { value: "geometric", label: "Geometric" },
      ],
    },
    {
      prompt: "What's your preferred denim fit?",
      questionType: "SINGLE_SELECT" as const,
      isRequired: false,
      sortOrder: 18,
      fieldKey: "specific_preference.denim_fit",
      options: [
        { value: "skinny", label: "Skinny" },
        { value: "straight", label: "Straight" },
        { value: "bootcut", label: "Bootcut" },
        { value: "wide_leg", label: "Wide Leg" },
        { value: "boyfriend", label: "Boyfriend" },
        { value: "mom", label: "Mom" },
      ],
    },
    {
      prompt: "What dress styles do you prefer?",
      questionType: "MULTI_SELECT" as const,
      isRequired: false,
      sortOrder: 19,
      fieldKey: "specific_preference.dress_styles",
      options: [
        { value: "wrap", label: "Wrap" },
        { value: "midi", label: "Midi" },
        { value: "maxi", label: "Maxi" },
        { value: "mini", label: "Mini" },
        { value: "a_line", label: "A-Line" },
        { value: "bodycon", label: "Bodycon" },
        { value: "shirt_dress", label: "Shirt Dress" },
      ],
    },
    {
      prompt: "What heel height do you prefer?",
      questionType: "SINGLE_SELECT" as const,
      isRequired: false,
      sortOrder: 20,
      fieldKey: "specific_preference.heel_preference",
      options: [
        { value: "FLAT", label: "Flat only" },
        { value: "LOW", label: "Low (1-2\")" },
        { value: "MEDIUM", label: "Medium (2-3\")" },
        { value: "HIGH", label: "High (3\"+)" },
        { value: "NO_PREFERENCE", label: "No preference" },
      ],
    },
    {
      prompt: "What jewelry metal do you prefer?",
      questionType: "SINGLE_SELECT" as const,
      isRequired: false,
      sortOrder: 21,
      fieldKey: "specific_preference.jewelry_preference",
      options: [
        { value: "GOLD", label: "Gold" },
        { value: "SILVER", label: "Silver" },
        { value: "ROSE_GOLD", label: "Rose Gold" },
        { value: "MIXED", label: "Mixed" },
        { value: "NO_PREFERENCE", label: "No preference" },
      ],
    },
    {
      prompt: "What are your favorite brands?",
      helperText: "List any brands you love",
      questionType: "TEXT" as const,
      isRequired: false,
      sortOrder: 22,
      fieldKey: "user.favorite_brands",
    },
  ];

  for (const q of styleQuestions) {
    await prisma.quizQuestion.upsert({
      where: {
        quizId_sortOrder: { quizId: styleQuiz.id, sortOrder: q.sortOrder },
      },
      update: {
        prompt: q.prompt,
        helperText: q.helperText ?? undefined,
        questionType: q.questionType,
        isRequired: q.isRequired,
        fieldKey: q.fieldKey,
        options: q.options ?? undefined,
        metadata: q.metadata ?? undefined,
      },
      create: {
        quizId: styleQuiz.id,
        prompt: q.prompt,
        helperText: q.helperText ?? undefined,
        questionType: q.questionType,
        isRequired: q.isRequired,
        sortOrder: q.sortOrder,
        fieldKey: q.fieldKey,
        options: q.options ?? undefined,
        metadata: q.metadata ?? undefined,
      },
    });
  }

  console.log(`  ✓ Style Preference Quiz seeded (${styleQuestions.length} questions)`);
}
