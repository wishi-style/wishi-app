import { PrismaClient } from "../../src/generated/prisma/client";
import { DEMO_CLERK_IDS, DEMO_CLERK_ID_LIST } from "../../src/lib/demo/constants";

// Demo accounts surfaced by /demo on staging. Each clerkId is a fake string;
// the /demo page sets E2E auth cookies so the app never calls Clerk for these
// users. Safe because isE2EAuthModeEnabled() gates both the /demo page and
// the E2E cookie path on DEPLOYED_ENV !== "production".

interface DemoClientSpec {
  clerkId: string;
  email: string;
  firstName: string;
  lastName: string;
  gender: "FEMALE" | "MALE" | "NON_BINARY";
  styleDirection: string[];
  budgetBracket: string;
  stylePreferences: string[];
}

interface DemoStylistSpec {
  clerkId: string;
  email: string;
  firstName: string;
  lastName: string;
  bio: string;
  styleSpecialties: string[];
  genderPreference: Array<"FEMALE" | "MALE" | "NON_BINARY" | "PREFER_NOT_TO_SAY">;
  budgetBrackets: string[];
  yearsExperience: number;
}

const DEMO_CLIENT: DemoClientSpec = {
  clerkId: DEMO_CLERK_IDS.client,
  email: "demo.client.sasha@wishi.local",
  firstName: "Sasha",
  lastName: "Demo",
  gender: "FEMALE",
  styleDirection: ["minimalist", "classic"],
  budgetBracket: "moderate",
  stylePreferences: ["minimalist", "classic"],
};

const DEMO_STYLISTS: DemoStylistSpec[] = [
  {
    // Best match for Sasha — same gender, overlapping style, matching budget.
    clerkId: DEMO_CLERK_IDS.stylistMaya,
    email: "demo.stylist.maya@wishi.local",
    firstName: "Maya",
    lastName: "Demo",
    bio: "Minimalist wardrobe builder. 8 years with Vogue and independent clients.",
    styleSpecialties: ["minimalist", "classic", "scandi"],
    genderPreference: ["FEMALE"],
    budgetBrackets: ["moderate", "premium"],
    yearsExperience: 8,
  },
  {
    // Second eligible stylist — gives matcher a real choice.
    clerkId: DEMO_CLERK_IDS.stylistAlex,
    email: "demo.stylist.alex@wishi.local",
    firstName: "Alex",
    lastName: "Demo",
    bio: "Versatile stylist working across genders and price points.",
    styleSpecialties: ["minimalist", "bohemian"],
    genderPreference: ["FEMALE", "MALE", "NON_BINARY", "PREFER_NOT_TO_SAY"],
    budgetBrackets: ["moderate", "premium"],
    yearsExperience: 5,
  },
  {
    // Intentionally off-match on gender so matcher filtering is visible.
    clerkId: DEMO_CLERK_IDS.stylistJordan,
    email: "demo.stylist.jordan@wishi.local",
    firstName: "Jordan",
    lastName: "Demo",
    bio: "Streetwear + eclectic menswear for expressive clients.",
    styleSpecialties: ["streetwear", "eclectic"],
    genderPreference: ["MALE", "NON_BINARY"],
    budgetBrackets: ["premium"],
    yearsExperience: 6,
  },
];

const NOTIFICATION_CATEGORIES = [
  "session_updates",
  "marketing",
  "chat",
  "promotions",
] as const;

async function upsertDemoUser(
  prisma: PrismaClient,
  spec: { clerkId: string; email: string; firstName: string; lastName: string },
  role: "CLIENT" | "STYLIST",
  gender?: "FEMALE" | "MALE" | "NON_BINARY",
) {
  return prisma.user.upsert({
    where: { clerkId: spec.clerkId },
    update: {
      email: spec.email,
      firstName: spec.firstName,
      lastName: spec.lastName,
      role,
      gender: gender ?? null,
    },
    create: {
      clerkId: spec.clerkId,
      authProvider: "EMAIL",
      email: spec.email,
      firstName: spec.firstName,
      lastName: spec.lastName,
      role,
      gender: gender ?? null,
      referralCode: `DEMO-${spec.clerkId.toUpperCase()}`,
    },
  });
}

async function ensureNotificationPreferences(
  prisma: PrismaClient,
  userId: string,
) {
  const existing = await prisma.notificationPreference.count({ where: { userId } });
  if (existing > 0) return;

  const rows = NOTIFICATION_CATEGORIES.flatMap((category) => [
    { userId, channel: "EMAIL" as const, category, isEnabled: true },
    { userId, channel: "SMS" as const, category, isEnabled: true },
    { userId, channel: "PUSH" as const, category, isEnabled: false },
  ]);
  await prisma.notificationPreference.createMany({ data: rows });
}

async function seedDemoClient(prisma: PrismaClient) {
  const user = await upsertDemoUser(prisma, DEMO_CLIENT, "CLIENT", DEMO_CLIENT.gender);

  await ensureNotificationPreferences(prisma, user.id);

  // Match-quiz result drives the auto-matcher's scoring inputs.
  const existingQuiz = await prisma.matchQuizResult.findFirst({
    where: { userId: user.id },
    orderBy: { completedAt: "desc" },
  });
  if (!existingQuiz) {
    await prisma.matchQuizResult.create({
      data: {
        userId: user.id,
        genderToStyle: DEMO_CLIENT.gender,
        styleDirection: DEMO_CLIENT.styleDirection,
        budgetBracket: DEMO_CLIENT.budgetBracket,
        rawAnswers: {},
      },
    });
  }

  // StyleProfile — marks the style quiz as complete so the app doesn't push
  // the demo client back through onboarding.
  await prisma.styleProfile.upsert({
    where: { userId: user.id },
    update: {
      stylePreferences: DEMO_CLIENT.stylePreferences,
      quizCompletedAt: new Date(),
    },
    create: {
      userId: user.id,
      stylePreferences: DEMO_CLIENT.stylePreferences,
      styleIcons: [],
      comfortZoneLevel: 5,
      dressCode: "casual",
      quizCompletedAt: new Date(),
      quizAnswers: { "style_profile.style_preferences": DEMO_CLIENT.stylePreferences },
    },
  });

  await prisma.bodyProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      bodyType: "hourglass",
      highlightAreas: ["waist"],
      height: "5'6\"",
      topFit: "REGULAR",
      bottomFit: "REGULAR",
    },
  });

  return user;
}

async function seedDemoStylist(prisma: PrismaClient, spec: DemoStylistSpec) {
  const user = await upsertDemoUser(prisma, spec, "STYLIST");

  await ensureNotificationPreferences(prisma, user.id);

  await prisma.stylistProfile.upsert({
    where: { userId: user.id },
    update: {
      bio: spec.bio,
      styleSpecialties: spec.styleSpecialties,
      genderPreference: spec.genderPreference,
      budgetBrackets: spec.budgetBrackets,
      yearsExperience: spec.yearsExperience,
      isAvailable: true,
      matchEligible: true,
      matchEligibleSetAt: new Date(),
      onboardingStatus: "ELIGIBLE",
      onboardingStep: 12,
      onboardingCompletedAt: new Date(),
    },
    create: {
      userId: user.id,
      stylistType: "PLATFORM",
      bio: spec.bio,
      styleSpecialties: spec.styleSpecialties,
      genderPreference: spec.genderPreference,
      budgetBrackets: spec.budgetBrackets,
      yearsExperience: spec.yearsExperience,
      isAvailable: true,
      matchEligible: true,
      matchEligibleSetAt: new Date(),
      onboardingStatus: "ELIGIBLE",
      onboardingStep: 12,
      onboardingCompletedAt: new Date(),
    },
  });

  return user;
}

export async function seedDemoUsers(prisma: PrismaClient) {
  if (process.env.ENABLE_DEMO_SEED !== "true") {
    console.log("  ↷ Demo users skipped (ENABLE_DEMO_SEED != true)");
    return;
  }
  if (process.env.DEPLOYED_ENV === "production") {
    console.log("  ↷ Demo users skipped (production env)");
    return;
  }

  await seedDemoClient(prisma);
  for (const stylist of DEMO_STYLISTS) {
    await seedDemoStylist(prisma, stylist);
  }

  console.log(
    `  ✓ Demo users seeded (${DEMO_CLERK_ID_LIST.length}: ${DEMO_CLERK_ID_LIST.join(", ")})`,
  );
}

