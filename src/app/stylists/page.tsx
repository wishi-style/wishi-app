import { Suspense } from "react";
import type { Metadata } from "next";
import { SparklesIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth/server-auth";
import { cosmeticMatchScore } from "@/lib/matching/score";
import { StylistCard } from "@/components/stylist/stylist-card";
import { StylistFilters } from "@/components/stylist/stylist-filters";
import { SiteHeader } from "@/components/primitives/site-header";
import { SiteFooter } from "@/components/primitives/site-footer";
import { PillButton } from "@/components/primitives/pill-button";
import { Reveal } from "@/components/primitives/reveal";
import { WhatYouReceiveDialog } from "./what-you-receive-dialog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Our Stylists — Wishi",
  description:
    "Browse our curated roster of expert stylists. Take the style match quiz to see who fits your taste, budget, and goals.",
};

interface Props {
  searchParams: Promise<{ q?: string; style?: string }>;
}

async function StylistGrid({ searchParams }: Props) {
  const params = await searchParams;
  const { userId: clerkId } = await getServerAuth();

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
    name: `${s.user.firstName} ${s.user.lastName}`.trim(),
  }));

  if (quizResult) {
    stylistsWithScores.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
  }

  if (stylistsWithScores.length === 0) {
    return (
      <p className="py-20 text-center text-muted-foreground text-sm">
        No stylists found. Try adjusting your filters.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
      {stylistsWithScores.map((s, i) => (
        <Reveal key={s.id} delay={i * 60}>
          <StylistCard
            id={s.id}
            userId={s.userId}
            name={s.name}
            avatarUrl={s.user.avatarUrl}
            bio={s.bio}
            styleSpecialties={s.styleSpecialties}
            matchScore={quizResult ? s.matchScore : null}
            isAvailable={s.isAvailable}
          />
        </Reveal>
      ))}
    </div>
  );
}

export default function StylistsPage(props: Props) {
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background">
        {/* Receive-services dialog trigger band */}
        <div className="border-y border-border">
          <div className="mx-auto max-w-6xl px-6 md:px-10 py-4 flex items-center justify-center">
            <WhatYouReceiveDialog />
          </div>
        </div>

        {/* Hero CTA */}
        <section className="border-b border-border bg-muted/40">
          <div className="mx-auto max-w-3xl px-6 md:px-10 py-12 md:py-16 text-center">
            <h1 className="font-display text-3xl md:text-4xl mb-3">
              Find Your Perfect Stylist
            </h1>
            <p className="text-base text-muted-foreground max-w-md mx-auto mb-6">
              Take a quick style quiz and we&apos;ll match you with the stylists who truly get
              your vibe.
            </p>
            <PillButton href="/match-quiz" variant="solid" size="lg" className="gap-2">
              <SparklesIcon className="h-4 w-4" />
              Take Your Style Match
            </PillButton>
          </div>
        </section>

        {/* Discover */}
        <section className="py-12 md:py-16">
          <div className="mx-auto max-w-5xl px-6 md:px-10">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
              <div>
                <h2 className="font-display text-2xl md:text-3xl">Discover Our Stylists</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Browse our curated roster of expert stylists.
                </p>
              </div>
              <Suspense fallback={null}>
                <StylistFilters />
              </Suspense>
            </div>

            <Suspense
              fallback={
                <div className="py-20 text-center text-muted-foreground">
                  Loading stylists…
                </div>
              }
            >
              <StylistGrid searchParams={props.searchParams} />
            </Suspense>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="border-t border-border bg-muted/40">
          <div className="mx-auto max-w-2xl px-6 md:px-10 py-12 text-center">
            <h3 className="font-display text-2xl mb-2">Ready to get styled?</h3>
            <p className="text-sm text-muted-foreground mb-5">
              Take a 2-minute style quiz and get matched with your ideal stylist.
            </p>
            <PillButton href="/match-quiz" variant="solid" size="lg" className="gap-2">
              <SparklesIcon className="h-4 w-4" />
              Take Your Style Match
            </PillButton>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
