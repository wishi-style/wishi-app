import type { Prisma } from "../../src/generated/prisma/client";
import { PrismaClient } from "../../src/generated/prisma/client";
import { DEMO_CLERK_IDS, DEMO_CLERK_ID_LIST } from "../../src/lib/demo/constants";
import { recomputeAverageRating } from "../../src/lib/stylists/review.service";

// Demo accounts surfaced by /demo on staging. Each clerkId is a fake string;
// the /demo page sets E2E auth cookies so the app never calls Clerk for these
// users. Safe because isE2EAuthModeEnabled() gates both the /demo page and
// the E2E cookie path on DEPLOYED_ENV !== "production".
//
// Stylist data is intentionally rich: every nullable StylistProfile field is
// populated, each claimed style has the minimum 3 profile boards, and three
// non-demo "fixture reviewer" CLIENT users author StylistReview rows. The
// fixture reviewers are deliberately NOT in DEMO_CLERK_IDS so the daily
// demo-reset worker leaves them (and their reviews) alone.

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

interface SocialLink {
  platform: "instagram" | "pinterest";
  url: string;
}

interface ProfileBoardSpec {
  style: string;
  title: string;
  photoSeeds: string[];
}

interface StylistReviewSpec {
  authorKey: keyof typeof FIXTURE_REVIEWERS;
  rating: number;
  reviewText: string;
}

interface DemoStylistSpec {
  clerkId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  birthday: string; // ISO date
  bio: string;
  philosophy: string;
  signatureStyle: string;
  background: string;
  directorPick: string;
  fashionIcons: string[];
  favoriteItems: string[];
  achievements: string[];
  education: string[];
  styleSpecialties: string[];
  styleExpertiseLevels: Record<string, 1 | 2 | 3>;
  bodySpecialties: string[];
  expertiseByGender: Record<"FEMALE" | "MALE" | "NON_BINARY" | "PREFER_NOT_TO_SAY", string[]>;
  genderPreference: Array<"FEMALE" | "MALE" | "NON_BINARY" | "PREFER_NOT_TO_SAY">;
  budgetBrackets: string[];
  yearsExperience: number;
  totalSessionsCompleted: number;
  instagramHandle: string;
  socialLinks: SocialLink[];
  avatarSeed: string;
  profileBoards: ProfileBoardSpec[];
  reviews: StylistReviewSpec[];
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

// Non-demo fixture clients who author StylistReview rows. Outside
// DEMO_CLERK_ID_LIST so the daily demo-reset worker doesn't wipe them.
const FIXTURE_REVIEWERS = {
  rhea: {
    clerkId: "fixture-reviewer-rhea",
    email: "fixture.reviewer.rhea@wishi.fixtures",
    firstName: "Rhea",
    lastName: "Fixture",
    gender: "FEMALE" as const,
  },
  miles: {
    clerkId: "fixture-reviewer-miles",
    email: "fixture.reviewer.miles@wishi.fixtures",
    firstName: "Miles",
    lastName: "Fixture",
    gender: "MALE" as const,
  },
  noor: {
    clerkId: "fixture-reviewer-noor",
    email: "fixture.reviewer.noor@wishi.fixtures",
    firstName: "Noor",
    lastName: "Fixture",
    gender: "NON_BINARY" as const,
  },
} as const;

const DEMO_STYLISTS: DemoStylistSpec[] = [
  {
    // Best match for Sasha — same gender, overlapping style, matching budget.
    clerkId: DEMO_CLERK_IDS.stylistMaya,
    email: "demo.stylist.maya@wishi.local",
    firstName: "Maya",
    lastName: "Demo",
    phone: "+15551110001",
    birthday: "1990-03-14",
    bio: "Minimalist wardrobe builder. 8 years with Vogue and independent clients across NYC and Copenhagen.",
    philosophy:
      "I dress people for the life they actually live, not the one they imagine they'll have someday. Closets should make Mondays easier.",
    signatureStyle:
      "Quiet luxury with a Scandi backbone — neutral palettes, exceptional fabrics, one piece per outfit that earns a second look.",
    background:
      "Started as an editorial assistant at Vogue, then ran personal styling for a Copenhagen capsule-wardrobe studio for five years before going independent.",
    directorPick:
      "Maya is who I send anyone rebuilding a wardrobe from scratch — she has a rare eye for what 'lasts'.",
    fashionIcons: ["Caroline de Maigret", "Phoebe Philo", "Sofia Coppola"],
    favoriteItems: ["The Row Margaux bag", "A. Emery sandals", "Khaite cashmere"],
    achievements: [
      "Featured Stylist, Vogue.com 2022",
      "Lead Stylist, Net-a-Porter Edit '23",
      "200+ five-star Wishi sessions",
    ],
    education: ["Parsons School of Design — BFA, Fashion Design"],
    styleSpecialties: ["minimalist", "classic", "scandi"],
    styleExpertiseLevels: { minimalist: 3, classic: 3, scandi: 2 },
    bodySpecialties: ["hourglass", "rectangle", "pear"],
    expertiseByGender: {
      FEMALE: ["workwear", "evening", "capsule wardrobe"],
      MALE: [],
      NON_BINARY: [],
      PREFER_NOT_TO_SAY: [],
    },
    genderPreference: ["FEMALE"],
    budgetBrackets: ["moderate", "premium"],
    yearsExperience: 8,
    totalSessionsCompleted: 42,
    instagramHandle: "maya.styles",
    socialLinks: [
      { platform: "instagram", url: "https://instagram.com/maya.styles" },
      { platform: "pinterest", url: "https://pinterest.com/maya_styles" },
    ],
    avatarSeed: "demo-stylist-maya",
    profileBoards: [
      { style: "minimalist", title: "Quiet luxury basics", photoSeeds: ["maya-min-1-a", "maya-min-1-b", "maya-min-1-c", "maya-min-1-d"] },
      { style: "minimalist", title: "Capsule for travel", photoSeeds: ["maya-min-2-a", "maya-min-2-b", "maya-min-2-c", "maya-min-2-d"] },
      { style: "minimalist", title: "Workwear edit", photoSeeds: ["maya-min-3-a", "maya-min-3-b", "maya-min-3-c", "maya-min-3-d"] },
      { style: "classic", title: "Tailored neutrals", photoSeeds: ["maya-cls-1-a", "maya-cls-1-b", "maya-cls-1-c", "maya-cls-1-d"] },
      { style: "classic", title: "Evening repertoire", photoSeeds: ["maya-cls-2-a", "maya-cls-2-b", "maya-cls-2-c", "maya-cls-2-d"] },
      { style: "classic", title: "Weekend off-duty", photoSeeds: ["maya-cls-3-a", "maya-cls-3-b", "maya-cls-3-c", "maya-cls-3-d"] },
      { style: "scandi", title: "Copenhagen winter", photoSeeds: ["maya-sca-1-a", "maya-sca-1-b", "maya-sca-1-c", "maya-sca-1-d"] },
      { style: "scandi", title: "Summerhouse linens", photoSeeds: ["maya-sca-2-a", "maya-sca-2-b", "maya-sca-2-c", "maya-sca-2-d"] },
      { style: "scandi", title: "Layering essentials", photoSeeds: ["maya-sca-3-a", "maya-sca-3-b", "maya-sca-3-c", "maya-sca-3-d"] },
    ],
    reviews: [
      { authorKey: "rhea", rating: 5, reviewText: "Maya rebuilt my closet around three colors and I get dressed in 90 seconds now. She knows what to keep and what to let go." },
      { authorKey: "miles", rating: 5, reviewText: "I wanted a wardrobe that didn't feel like 'menswear' and Maya nailed it — sharp without being stuffy." },
      { authorKey: "noor", rating: 4, reviewText: "Loved the styling — would have loved one or two bolder picks but the foundations are gorgeous." },
    ],
  },
  {
    // Second eligible stylist — gives matcher a real choice.
    clerkId: DEMO_CLERK_IDS.stylistAlex,
    email: "demo.stylist.alex@wishi.local",
    firstName: "Alex",
    lastName: "Demo",
    phone: "+15551110002",
    birthday: "1992-07-22",
    bio: "Versatile stylist working across genders and price points. LA-based, ex-pull team for indie magazines.",
    philosophy:
      "Style is a posture, not a uniform. I help clients borrow from places they wouldn't normally shop and still feel like themselves.",
    signatureStyle:
      "Bohemian core with high-shine surprises — vintage denim, hand-loomed knits, one unexpected silver piece.",
    background:
      "Stylist on freelance editorial pulls for Nylon, The Cut, and Allure. Three years building wardrobes for musicians on tour.",
    directorPick:
      "Pair Alex with anyone who keeps saying 'I have nothing to wear' but secretly has 80 things — they'll edit and remix.",
    fashionIcons: ["Jane Birkin", "Solange", "Harry Styles"],
    favoriteItems: ["Levi's 501 vintage", "Dôen sundress", "Maryam Nassir Zadeh boot"],
    achievements: [
      "Wardrobe styling for Coachella tour cycle 2024",
      "Editor's Pick, Nylon styling roster",
      "Built 60+ travel capsules on Wishi",
    ],
    education: [
      "Otis College of Art and Design — BFA, Fashion Design",
      "FIT NYC — Continuing Ed, Color Theory",
    ],
    styleSpecialties: ["minimalist", "bohemian"],
    styleExpertiseLevels: { minimalist: 2, bohemian: 3 },
    bodySpecialties: ["athletic", "rectangle", "pear", "apple"],
    expertiseByGender: {
      FEMALE: ["festival", "vacation", "everyday"],
      MALE: ["festival", "everyday"],
      NON_BINARY: ["everyday", "evening"],
      PREFER_NOT_TO_SAY: ["everyday"],
    },
    genderPreference: ["FEMALE", "MALE", "NON_BINARY", "PREFER_NOT_TO_SAY"],
    budgetBrackets: ["moderate", "premium"],
    yearsExperience: 5,
    totalSessionsCompleted: 27,
    instagramHandle: "alex.dresses",
    socialLinks: [
      { platform: "instagram", url: "https://instagram.com/alex.dresses" },
      { platform: "pinterest", url: "https://pinterest.com/alex_dresses" },
    ],
    avatarSeed: "demo-stylist-alex",
    profileBoards: [
      { style: "minimalist", title: "Off-duty in white", photoSeeds: ["alex-min-1-a", "alex-min-1-b", "alex-min-1-c", "alex-min-1-d"] },
      { style: "minimalist", title: "Slip dress capsule", photoSeeds: ["alex-min-2-a", "alex-min-2-b", "alex-min-2-c", "alex-min-2-d"] },
      { style: "minimalist", title: "Tonal layering", photoSeeds: ["alex-min-3-a", "alex-min-3-b", "alex-min-3-c", "alex-min-3-d"] },
      { style: "bohemian", title: "Festival weekender", photoSeeds: ["alex-boh-1-a", "alex-boh-1-b", "alex-boh-1-c", "alex-boh-1-d"] },
      { style: "bohemian", title: "Resort + vacation", photoSeeds: ["alex-boh-2-a", "alex-boh-2-b", "alex-boh-2-c", "alex-boh-2-d"] },
      { style: "bohemian", title: "Vintage denim mix", photoSeeds: ["alex-boh-3-a", "alex-boh-3-b", "alex-boh-3-c", "alex-boh-3-d"] },
    ],
    reviews: [
      { authorKey: "rhea", rating: 5, reviewText: "Alex pulled the most unexpected dress for my friend's wedding and I still get compliments on it." },
      { authorKey: "miles", rating: 4, reviewText: "Solid range and zero judgment. Got me into wider denim I'd never have tried alone." },
      { authorKey: "noor", rating: 5, reviewText: "Finally a stylist who doesn't push 'masc' or 'femme' on me — Alex just dressed me." },
    ],
  },
  {
    // Intentionally off-match on gender so matcher filtering is visible.
    clerkId: DEMO_CLERK_IDS.stylistJordan,
    email: "demo.stylist.jordan@wishi.local",
    firstName: "Jordan",
    lastName: "Demo",
    phone: "+15551110003",
    birthday: "1988-11-04",
    bio: "Streetwear + eclectic menswear for expressive clients. Tokyo and Brooklyn references, NBA stylist credits.",
    philosophy:
      "Loud is fine. Sloppy is not. I dress people who want to feel like themselves on the street and on camera.",
    signatureStyle:
      "Workwear silhouettes with statement color, archival sneakers, and one tailoring trick per outfit so it never reads costume.",
    background:
      "Started in Tokyo working for a vintage importer, moved to Brooklyn 2019, currently styles two NBA athletes off-court and a handful of musicians.",
    directorPick:
      "Jordan is the right call when a client says they want streetwear but actually mean 'I want to look intentional, not lazy'.",
    fashionIcons: ["Virgil Abloh", "André 3000", "Tinker Hatfield"],
    favoriteItems: ["Visvim FBT", "Engineered Garments BDU jacket", "Stüssy World Tour tee"],
    achievements: [
      "Off-court stylist, two NBA roster clients",
      "Cover styling, Highsnobiety x SSENSE 2023",
      "Tokyo vintage buyer, 4 years",
    ],
    education: ["Bunka Fashion College — Fashion Marketing diploma"],
    styleSpecialties: ["streetwear", "eclectic"],
    styleExpertiseLevels: { streetwear: 3, eclectic: 3 },
    bodySpecialties: ["athletic", "rectangle"],
    expertiseByGender: {
      FEMALE: [],
      MALE: ["streetwear", "tailoring", "tour wardrobe"],
      NON_BINARY: ["streetwear", "expressive everyday"],
      PREFER_NOT_TO_SAY: [],
    },
    genderPreference: ["MALE", "NON_BINARY"],
    budgetBrackets: ["premium"],
    yearsExperience: 6,
    totalSessionsCompleted: 31,
    instagramHandle: "jordan.fits",
    socialLinks: [
      { platform: "instagram", url: "https://instagram.com/jordan.fits" },
      { platform: "pinterest", url: "https://pinterest.com/jordan_fits" },
    ],
    avatarSeed: "demo-stylist-jordan",
    profileBoards: [
      { style: "streetwear", title: "Workwear remix", photoSeeds: ["jordan-str-1-a", "jordan-str-1-b", "jordan-str-1-c", "jordan-str-1-d"] },
      { style: "streetwear", title: "Archive sneakers", photoSeeds: ["jordan-str-2-a", "jordan-str-2-b", "jordan-str-2-c", "jordan-str-2-d"] },
      { style: "streetwear", title: "Tour-week wardrobe", photoSeeds: ["jordan-str-3-a", "jordan-str-3-b", "jordan-str-3-c", "jordan-str-3-d"] },
      { style: "eclectic", title: "Color story: cobalt", photoSeeds: ["jordan-ecl-1-a", "jordan-ecl-1-b", "jordan-ecl-1-c", "jordan-ecl-1-d"] },
      { style: "eclectic", title: "Tokyo vintage haul", photoSeeds: ["jordan-ecl-2-a", "jordan-ecl-2-b", "jordan-ecl-2-c", "jordan-ecl-2-d"] },
      { style: "eclectic", title: "Tailoring + sneakers", photoSeeds: ["jordan-ecl-3-a", "jordan-ecl-3-b", "jordan-ecl-3-c", "jordan-ecl-3-d"] },
    ],
    reviews: [
      { authorKey: "miles", rating: 5, reviewText: "Jordan got me out of all-black and into color without making me feel like a clown. Game changer." },
      { authorKey: "noor", rating: 5, reviewText: "Best stylist I've worked with for non-binary fits — knows where the menswear cuts that don't read as 'menswear'." },
      { authorKey: "rhea", rating: 4, reviewText: "Pulled an incredible look for my partner's tour rehearsal — fast turnaround, real research on the brands." },
    ],
  },
];

const NOTIFICATION_CATEGORIES = [
  "session_updates",
  "marketing",
  "chat",
  "promotions",
] as const;

function avatarUrlFor(seed: string): string {
  return `https://i.pravatar.cc/600?u=${seed}`;
}

function boardPhotoUrlFor(seed: string): string {
  return `https://picsum.photos/seed/${seed}/800/1000`;
}

async function upsertDemoUser(
  prisma: PrismaClient,
  spec: {
    clerkId: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    birthday?: string;
    avatarUrl?: string;
  },
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
      ...(spec.phone ? { phone: spec.phone } : {}),
      ...(spec.birthday ? { birthday: new Date(spec.birthday) } : {}),
      ...(spec.avatarUrl ? { avatarUrl: spec.avatarUrl } : {}),
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
      ...(spec.phone ? { phone: spec.phone } : {}),
      ...(spec.birthday ? { birthday: new Date(spec.birthday) } : {}),
      ...(spec.avatarUrl ? { avatarUrl: spec.avatarUrl } : {}),
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

async function seedFixtureReviewers(prisma: PrismaClient) {
  const reviewers: Record<string, { id: string }> = {};
  for (const [key, spec] of Object.entries(FIXTURE_REVIEWERS)) {
    const user = await upsertDemoUser(prisma, spec, "CLIENT", spec.gender);
    await ensureNotificationPreferences(prisma, user.id);
    reviewers[key] = { id: user.id };
  }
  return reviewers;
}

async function seedStylistSocialLinks(
  prisma: PrismaClient,
  userId: string,
  links: SocialLink[],
) {
  for (const link of links) {
    await prisma.userSocialLink.upsert({
      where: { userId_platform: { userId, platform: link.platform } },
      update: { url: link.url },
      create: { userId, platform: link.platform, url: link.url },
    });
  }
}

async function seedStylistProfilePhoto(
  prisma: PrismaClient,
  userId: string,
  url: string,
) {
  // No natural unique key on UserPhoto — use a deterministic id so re-runs upsert.
  const id = `seed-userphoto-${userId}`;
  await prisma.userPhoto.upsert({
    where: { id },
    update: { url, isProfile: true, sortOrder: 0 },
    create: { id, userId, url, isProfile: true, sortOrder: 0 },
  });
}

async function seedProfileBoards(
  prisma: PrismaClient,
  stylistProfileId: string,
  spec: DemoStylistSpec,
): Promise<string> {
  // Assign each board a deterministic id derived from the stylist + style + index
  // so re-running the seed overwrites instead of duplicating.
  let primaryBoardId: string | null = null;

  const groupedByStyle = new Map<string, ProfileBoardSpec[]>();
  for (const b of spec.profileBoards) {
    const list = groupedByStyle.get(b.style) ?? [];
    list.push(b);
    groupedByStyle.set(b.style, list);
  }

  for (const [style, boards] of groupedByStyle) {
    for (let idx = 0; idx < boards.length; idx++) {
      const board = boards[idx];
      const boardId = `seed-board-${spec.clerkId}-${style}-${idx + 1}`;
      await prisma.board.upsert({
        where: { id: boardId },
        update: {
          title: board.title,
          stylistProfileId,
          isFeaturedOnProfile: true,
          profileStyle: style,
          type: "MOODBOARD",
          sessionId: null,
        },
        create: {
          id: boardId,
          type: "MOODBOARD",
          sessionId: null,
          stylistProfileId,
          isFeaturedOnProfile: true,
          profileStyle: style,
          title: board.title,
        },
      });

      for (let p = 0; p < board.photoSeeds.length; p++) {
        const seed = board.photoSeeds[p];
        const photoId = `seed-bp-${boardId}-${p + 1}`;
        await prisma.boardPhoto.upsert({
          where: { id: photoId },
          update: {
            boardId,
            s3Key: `placeholder/${seed}.jpg`,
            url: boardPhotoUrlFor(seed),
            orderIndex: p,
          },
          create: {
            id: photoId,
            boardId,
            s3Key: `placeholder/${seed}.jpg`,
            url: boardPhotoUrlFor(seed),
            orderIndex: p,
          },
        });
      }

      // Pick the first board of the first style as the featured profile moodboard.
      if (!primaryBoardId) primaryBoardId = boardId;
    }
  }

  if (!primaryBoardId) {
    throw new Error(`No profile boards generated for ${spec.clerkId}`);
  }
  return primaryBoardId;
}

async function seedStylistReviews(
  prisma: PrismaClient,
  stylistProfileId: string,
  spec: DemoStylistSpec,
  reviewers: Record<string, { id: string }>,
) {
  for (const review of spec.reviews) {
    const reviewer = reviewers[review.authorKey];
    if (!reviewer) {
      throw new Error(`Unknown fixture reviewer: ${review.authorKey}`);
    }
    await prisma.stylistReview.upsert({
      where: {
        userId_stylistProfileId: { userId: reviewer.id, stylistProfileId },
      },
      update: { rating: review.rating, reviewText: review.reviewText },
      create: {
        userId: reviewer.id,
        stylistProfileId,
        rating: review.rating,
        reviewText: review.reviewText,
      },
    });
  }
  await recomputeAverageRating(stylistProfileId);
}

async function seedDemoStylist(
  prisma: PrismaClient,
  spec: DemoStylistSpec,
  reviewers: Record<string, { id: string }>,
) {
  const avatarUrl = avatarUrlFor(spec.avatarSeed);
  const user = await upsertDemoUser(
    prisma,
    {
      clerkId: spec.clerkId,
      email: spec.email,
      firstName: spec.firstName,
      lastName: spec.lastName,
      phone: spec.phone,
      birthday: spec.birthday,
      avatarUrl,
    },
    "STYLIST",
  );

  await ensureNotificationPreferences(prisma, user.id);
  await seedStylistSocialLinks(prisma, user.id, spec.socialLinks);
  await seedStylistProfilePhoto(prisma, user.id, avatarUrl);

  const baseProfileFields = {
    bio: spec.bio,
    philosophy: spec.philosophy,
    signatureStyle: spec.signatureStyle,
    background: spec.background,
    directorPick: spec.directorPick,
    fashionIcons: spec.fashionIcons,
    favoriteItems: spec.favoriteItems,
    achievements: spec.achievements,
    education: spec.education,
    styleSpecialties: spec.styleSpecialties,
    styleExpertiseLevels: spec.styleExpertiseLevels as Prisma.InputJsonValue,
    bodySpecialties: spec.bodySpecialties,
    expertiseByGender: spec.expertiseByGender as unknown as Prisma.InputJsonValue,
    genderPreference: spec.genderPreference,
    budgetBrackets: spec.budgetBrackets,
    yearsExperience: spec.yearsExperience,
    totalSessionsCompleted: spec.totalSessionsCompleted,
    instagramHandle: spec.instagramHandle,
    isAvailable: true,
    matchEligible: true,
    matchEligibleSetAt: new Date(),
    onboardingStatus: "ELIGIBLE" as const,
    onboardingStep: 12,
    onboardingCompletedAt: new Date(),
  };

  const profile = await prisma.stylistProfile.upsert({
    where: { userId: user.id },
    update: baseProfileFields,
    create: { userId: user.id, stylistType: "PLATFORM", ...baseProfileFields },
  });

  const primaryBoardId = await seedProfileBoards(prisma, profile.id, spec);

  // Set the featured profile moodboard now that the boards exist. Clear it first
  // to avoid the @unique constraint kicking in on the StylistProfile side
  // (profileMoodboardId is unique) before we re-point it.
  await prisma.stylistProfile.update({
    where: { id: profile.id },
    data: { profileMoodboardId: null },
  });
  await prisma.stylistProfile.update({
    where: { id: profile.id },
    data: { profileMoodboardId: primaryBoardId },
  });

  await seedStylistReviews(prisma, profile.id, spec, reviewers);

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
  const reviewers = await seedFixtureReviewers(prisma);
  for (const stylist of DEMO_STYLISTS) {
    await seedDemoStylist(prisma, stylist, reviewers);
  }

  console.log(
    `  ✓ Demo users seeded (${DEMO_CLERK_ID_LIST.length}: ${DEMO_CLERK_ID_LIST.join(", ")}) + ${
      Object.keys(FIXTURE_REVIEWERS).length
    } fixture reviewers`,
  );
}
