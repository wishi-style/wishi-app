import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { CheckIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { cosmeticMatchScore } from "@/lib/matching/score";
import { StylistCard } from "@/components/stylist/stylist-card";
import { PillButton } from "@/components/primitives/pill-button";
import { Reveal } from "@/components/primitives/reveal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your matches — Wishi",
  description: "The stylists we think fit you best, based on your style quiz.",
};

const sessionIncludes = [
  "A curated Mood Board",
  "Style Boards with shopping links",
  "Personal recommendations",
  "Unlimited chat with your stylist",
] as const;

export default async function ClientStylistsPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/sign-in");

  const quizResult = await prisma.matchQuizResult.findFirst({
    where: { userId: viewer.id },
    orderBy: { completedAt: "desc" },
  });

  if (!quizResult) {
    redirect("/match-quiz");
  }

  const where: Record<string, unknown> = {
    matchEligible: true,
    user: { deletedAt: null },
  };
  if (quizResult.genderToStyle) {
    where.genderPreference = { has: quizResult.genderToStyle };
  }

  const stylists = await prisma.stylistProfile.findMany({
    where,
    include: {
      user: {
        select: { firstName: true, lastName: true, avatarUrl: true },
      },
    },
  });

  const scored = stylists
    .map((s: (typeof stylists)[number]) => ({
      ...s,
      score: cosmeticMatchScore(s, quizResult),
      name: `${s.user.firstName ?? ""} ${s.user.lastName ?? ""}`.trim(),
    }))
    .sort(
      (
        a: { score: number | null },
        b: { score: number | null },
      ) => (b.score ?? 0) - (a.score ?? 0),
    );

  const top = scored.slice(0, 3);
  const more = scored.slice(3, 9);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 md:px-10 py-12 md:py-16">
        <header className="mb-10 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
            Your match
          </p>
          <h1 className="font-display text-3xl md:text-4xl mb-3">
            Your Top Stylists
          </h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Based on your style quiz — tap through to view their profile, chat, or
            start a session.
          </p>
        </header>

        {top.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center">
            <p className="text-sm text-muted-foreground">
              We don&apos;t have matches for your current quiz yet. Try browsing
              every stylist.
            </p>
            <PillButton
              href="/stylists"
              variant="solid"
              size="md"
              className="mt-5"
            >
              Browse all stylists
            </PillButton>
          </div>
        ) : (
          <section className="mb-14">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {top.map(
                (
                  s: (typeof top)[number],
                  i: number,
                ) => (
                  <Reveal key={s.id} delay={i * 80}>
                    <StylistCard
                      id={s.id}
                      userId={s.userId}
                      name={s.name}
                      avatarUrl={s.user.avatarUrl}
                      bio={s.bio}
                      styleSpecialties={s.styleSpecialties}
                      matchScore={s.score}
                      isAvailable={s.isAvailable}
                    />
                  </Reveal>
                ),
              )}
            </div>
          </section>
        )}

        {/* Session includes */}
        <aside className="rounded-2xl bg-cream p-6 md:p-8 mb-14">
          <h2 className="font-display text-xl mb-4">Your session includes</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sessionIncludes.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </aside>

        {more.length > 0 && (
          <section>
            <h2 className="font-display text-xl md:text-2xl mb-6">
              More stylists who fit your vibe
            </h2>
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {more.map(
                (
                  s: (typeof more)[number],
                  i: number,
                ) => (
                  <Reveal key={s.id} delay={i * 60}>
                    <StylistCard
                      id={s.id}
                      userId={s.userId}
                      name={s.name}
                      avatarUrl={s.user.avatarUrl}
                      bio={s.bio}
                      styleSpecialties={s.styleSpecialties}
                      matchScore={s.score}
                      isAvailable={s.isAvailable}
                    />
                  </Reveal>
                ),
              )}
            </div>
          </section>
        )}

        <div className="mt-14 text-center">
          <PillButton href="/stylists" variant="outline" size="lg">
            Browse the full roster
          </PillButton>
        </div>
      </div>
    </div>
  );
}
