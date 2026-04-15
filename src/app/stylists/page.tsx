import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { cosmeticMatchScore } from "@/lib/matching/score";
import { StylistCard } from "@/components/stylist/stylist-card";
import { StylistFilters } from "@/components/stylist/stylist-filters";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ q?: string; style?: string }>;
}

async function StylistGrid({ searchParams }: Props) {
  const params = await searchParams;
  const { userId: clerkId } = await auth();

  // Get client's latest match quiz result for scoring
  let quizResult = null;
  if (clerkId) {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    if (user) {
      quizResult = await prisma.matchQuizResult.findFirst({
        where: { userId: user.id },
        orderBy: { completedAt: "desc" },
      });
    }
  }

  // Build filter conditions
  const where: Record<string, unknown> = {
    matchEligible: true,
    user: { deletedAt: null },
  };

  if (params.style) {
    where.styleSpecialties = { has: params.style };
  }

  if (params.q) {
    where.OR = [
      { user: { firstName: { contains: params.q, mode: "insensitive" } } },
      { user: { lastName: { contains: params.q, mode: "insensitive" } } },
      { bio: { contains: params.q, mode: "insensitive" } },
    ];
  }

  const stylists = await prisma.stylistProfile.findMany({
    where,
    include: {
      user: {
        select: { firstName: true, lastName: true, avatarUrl: true },
      },
    },
    orderBy: { totalSessionsCompleted: "desc" },
  });

  const stylistsWithScores = stylists.map((s) => ({
    ...s,
    matchScore: quizResult ? cosmeticMatchScore(s, quizResult) : null,
    name: `${s.user.firstName} ${s.user.lastName}`,
  }));

  // Only sort by match score when the user has quiz results; otherwise preserve DB ordering
  if (quizResult) {
    stylistsWithScores.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
  }

  if (stylistsWithScores.length === 0) {
    return (
      <p className="py-20 text-center text-stone-500">
        No stylists found. Try adjusting your filters.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {stylistsWithScores.map((s) => (
        <StylistCard
          key={s.id}
          id={s.id}
          userId={s.userId}
          name={s.name}
          avatarUrl={s.user.avatarUrl}
          bio={s.bio}
          styleSpecialties={s.styleSpecialties}
          matchScore={quizResult ? s.matchScore : null}
          isAvailable={s.isAvailable}
        />
      ))}
    </div>
  );
}

export default function StylistsPage(props: Props) {
  return (
    <main className="min-h-screen bg-[#FAF8F5]">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="mb-2 font-serif text-3xl font-light text-stone-900">
          Our Stylists
        </h1>
        <p className="mb-8 text-sm text-stone-500">
          Find a stylist who matches your taste, budget, and goals.
        </p>

        <div className="mb-8">
          <Suspense fallback={null}>
            <StylistFilters />
          </Suspense>
        </div>

        <Suspense
          fallback={
            <div className="py-20 text-center text-stone-400">Loading stylists...</div>
          }
        >
          <StylistGrid searchParams={props.searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
