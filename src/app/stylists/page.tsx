import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth/server-auth";
import { cosmeticMatchScore } from "@/lib/matching/score";
import { SiteHeader } from "@/components/primitives/site-header";
import { SiteFooter } from "@/components/primitives/site-footer";
import { WhatYouReceiveDialog } from "./what-you-receive-dialog";
import { StylistsBrowser, type StylistRow } from "./stylists-browser";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Our Stylists — Wishi",
  description:
    "Browse our curated roster of expert stylists. Take the style match quiz to see who fits your taste, budget, and goals.",
};

export default async function StylistsPage() {
  const { userId: clerkId } = await getServerAuth();

  let user: { id: string; firstName: string | null } | null = null;
  let quizResult: Awaited<
    ReturnType<typeof prisma.matchQuizResult.findFirst>
  > = null;
  let favoriteIds: string[] = [];

  if (clerkId) {
    const fetched = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true, firstName: true },
    });
    if (fetched) {
      user = fetched;
      [quizResult, favoriteIds] = await Promise.all([
        prisma.matchQuizResult.findFirst({
          where: { userId: fetched.id },
          orderBy: { completedAt: "desc" },
        }),
        prisma.favoriteStylist
          .findMany({
            where: { userId: fetched.id },
            select: { stylistProfileId: true },
          })
          .then((rows) => rows.map((r) => r.stylistProfileId)),
      ]);
    }
  }

  const stylists = await prisma.stylistProfile.findMany({
    where: {
      matchEligible: true,
      user: { deletedAt: null },
    },
    include: {
      user: {
        select: { firstName: true, lastName: true, avatarUrl: true },
      },
    },
    orderBy: { totalSessionsCompleted: "desc" },
  });

  const rows: StylistRow[] = stylists.map((s) => {
    const name = `${s.user.firstName} ${s.user.lastName}`.trim();
    const matchScore = quizResult ? cosmeticMatchScore(s, quizResult) : null;
    return {
      id: s.id,
      userId: s.userId,
      name,
      avatarUrl: s.user.avatarUrl,
      bio: s.bio,
      styleSpecialties: s.styleSpecialties,
      matchScore,
      isAvailable: s.isAvailable,
      portfolioUrl: s.user.avatarUrl,
      // StylistProfile.location is pending (auto-memory task #10); the card
      // falls back to the first styleSpecialty until the schema field lands.
      location: null,
    };
  });

  const matched = quizResult
    ? rows
        .filter((r) => r.matchScore !== null)
        .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
        .slice(0, 3)
    : [];

  const matchedIds = new Set(matched.map((m) => m.id));
  const all = rows.filter((r) => !matchedIds.has(r.id));

  return (
    <>
      <SiteHeader />
      <div className="min-h-screen bg-background">
        {/* Trigger band — Loveable Stylists.tsx:167-177 */}
        <div className="border-y border-border">
          <div className="container flex items-center justify-center py-4">
            <WhatYouReceiveDialog />
          </div>
        </div>

        <StylistsBrowser
          isLoggedIn={user !== null}
          matched={matched}
          all={all}
          initialFavoriteIds={favoriteIds}
          firstName={user?.firstName ?? null}
        />
      </div>
      <SiteFooter />
    </>
  );
}
