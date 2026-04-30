import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StarIcon } from "lucide-react";
import { getServerAuth } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/prisma";
import { rankStylistsForClient } from "@/lib/services/match.service";
import { SiteHeader } from "@/components/primitives/site-header";
import { SiteFooter } from "@/components/primitives/site-footer";
import { PortfolioCarousel } from "./portfolio-carousel";

const howItWorksSteps = [
  { num: "1", title: "Get matched with A-list stylists", image: "/img/hiw-step1-match.png" },
  { num: "2", title: "Book an online session", image: "/img/hiw-step2-plan.png" },
  { num: "3", title: "Receive Personalized shoppable looks", image: "/img/hiw-step3-session.png" },
  { num: "4", title: "Buy what you love on Wishi", image: "/img/hiw-step4-shop.png" },
];

export const metadata: Metadata = {
  title: "Your stylist match — Wishi",
  description:
    "We found a stylist who matches your taste, body type, and shopping needs.",
};

export const dynamic = "force-dynamic";

export default async function StylistMatchPage() {
  // getServerAuth() rather than Clerk's auth() so the E2E_AUTH_MODE cookie
  // backdoor + impersonation paths resolve the same way they do everywhere
  // else in the app. Plain Clerk auth() returns null for E2E sessions and
  // would bounce authed test users to /match-quiz.
  const { userId: clerkId } = await getServerAuth();
  if (!clerkId) {
    redirect("/match-quiz");
  }

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!user) {
    redirect("/match-quiz");
  }

  // Quiz completion is the precondition for landing here. styleDirection
  // length is also the denominator for the match-percent vanity bar — keep
  // both in one read.
  const quiz = await prisma.matchQuizResult.findFirst({
    where: { userId: user.id },
    select: { id: true, styleDirection: true },
    orderBy: { completedAt: "desc" },
  });
  if (!quiz) {
    redirect("/match-quiz");
  }

  const ranked = await rankStylistsForClient(user.id);

  if (ranked.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-6 py-24 text-center">
          <h1 className="font-display text-4xl md:text-5xl mb-4">
            No matches available right now
          </h1>
          <p className="text-muted-foreground mb-8">
            Every stylist with capacity is currently booked. Browse the full
            roster — we&apos;ll add you to a waitlist if your top picks are
            unavailable.
          </p>
          <Link
            href="/stylists"
            className="inline-flex items-center rounded-full bg-foreground text-background px-8 py-3.5 text-sm font-medium hover:bg-foreground/90 transition-colors"
          >
            Browse all stylists
          </Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const top = ranked[0];
  const others = ranked.slice(1, 3);

  // Hydrate display fields for the top match. Score → match-percent vanity
  // bar capped at 99% (clientStyles.length * 10 is the max possible score).
  const topProfile = await prisma.stylistProfile.findUniqueOrThrow({
    where: { id: top.id },
    select: {
      id: true,
      bio: true,
      styleSpecialties: true,
      averageRating: true,
      totalSessionsCompleted: true,
      user: {
        select: {
          firstName: true,
          lastName: true,
          avatarUrl: true,
        },
      },
      profileBoards: {
        where: { isFeaturedOnProfile: true },
        select: {
          id: true,
          photos: {
            select: { url: true },
            orderBy: { orderIndex: "asc" },
            take: 1,
          },
        },
        take: 4,
      },
      reviews: {
        select: { id: true },
      },
    },
  });

  const portfolioImages: string[] = topProfile.profileBoards
    .flatMap((b) => b.photos.map((p) => p.url))
    .filter((url): url is string => Boolean(url));

  // Max possible score = 10 pts per quiz-selected style (see match.service.ts).
  // Falls back to top.score so a quiz with zero selected styles still shows
  // 99% rather than NaN — better-than-perfect matches still cap at 99 below.
  const maxPossibleScore = quiz.styleDirection.length * 10 || top.score || 1;
  const matchPercent = Math.min(99, Math.round((top.score / maxPossibleScore) * 99));

  const otherProfiles = await prisma.stylistProfile.findMany({
    where: { id: { in: others.map((s) => s.id) } },
    select: {
      id: true,
      user: { select: { firstName: true, lastName: true, avatarUrl: true } },
    },
  });
  // Preserve ranked order
  const otherProfilesById = new Map(otherProfiles.map((p) => [p.id, p]));
  const orderedOthers = others
    .map((s) => otherProfilesById.get(s.id))
    .filter((p): p is (typeof otherProfiles)[number] => Boolean(p));

  const firstName = topProfile.user.firstName;
  const fullName = `${firstName} ${topProfile.user.lastName}`.trim();

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="bg-background text-foreground py-14 md:py-20">
        <div className="mx-auto max-w-5xl px-6 md:px-10">
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl text-center mb-3 tracking-tight">
            We Found Your
          </h1>
          <h1 className="font-display italic text-4xl md:text-5xl lg:text-6xl text-center mb-12 tracking-tight">
            Perfect Match
          </h1>

          <div className="rounded-2xl bg-card text-foreground overflow-hidden shadow-2xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
              <div className="p-8 md:p-10 lg:p-12 flex flex-col justify-center">
                <div className="flex items-center gap-5 mb-6">
                  {topProfile.user.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={topProfile.user.avatarUrl}
                      alt={fullName}
                      className="h-20 w-20 rounded-full object-cover ring-2 ring-foreground/10"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="h-20 w-20 rounded-full bg-muted ring-2 ring-foreground/10"
                    />
                  )}
                  <div>
                    <h2 className="font-display text-3xl tracking-tight">
                      {fullName}
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-5 mb-6">
                  <span className="inline-flex items-center rounded-full bg-foreground text-background px-4 py-1.5 text-xs font-semibold">
                    {matchPercent}% Match
                  </span>
                  {topProfile.averageRating !== null && (
                    <span className="flex items-center gap-1 text-sm">
                      <StarIcon className="h-4 w-4 fill-foreground text-foreground" />
                      <span className="font-semibold">
                        {topProfile.averageRating.toFixed(1)}
                      </span>
                      {topProfile.reviews.length > 0 && (
                        <span className="text-muted-foreground underline underline-offset-2">
                          {topProfile.reviews.length} Reviews
                        </span>
                      )}
                    </span>
                  )}
                </div>

                {topProfile.bio && (
                  <div className="mb-6">
                    <p className="font-display text-base mb-2">
                      Why {firstName}?
                    </p>
                    <p className="text-sm text-foreground/70 leading-relaxed">
                      {topProfile.bio}
                    </p>
                  </div>
                )}

                {topProfile.styleSpecialties.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-6">
                    {topProfile.styleSpecialties.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-foreground/20 bg-secondary/50 px-4 py-1.5 text-xs font-medium text-foreground/80"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {topProfile.totalSessionsCompleted > 0 && (
                  <p className="text-xs text-muted-foreground mb-7 tracking-wide">
                    {topProfile.totalSessionsCompleted}+ sessions completed
                  </p>
                )}

                <Link
                  href={`/select-plan?stylistId=${topProfile.id}`}
                  className="w-full md:w-auto rounded-full bg-foreground text-background px-10 py-3.5 text-sm font-semibold hover:bg-foreground/90 transition-colors shadow-md text-center"
                >
                  Continue with {firstName}
                </Link>
              </div>

              <PortfolioCarousel images={portfolioImages} />
            </div>
          </div>

        </div>
      </main>

      {/* How It Works — Loveable StylistMatch.tsx:184-210 */}
      <section>
        <div className="container max-w-5xl py-14 md:py-20">
          <h2 className="font-display text-3xl md:text-4xl text-center mb-12">
            How it Works
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {howItWorksSteps.map((step) => (
              <div key={step.num} className="text-center">
                <p className="font-display text-3xl mb-2">{step.num}</p>
                <p className="font-body text-sm text-foreground/80 mb-5 leading-snug min-h-[40px]">
                  {step.title}
                </p>
                <div className="rounded-xl overflow-hidden border border-border bg-background shadow-sm">
                  <Image
                    src={step.image}
                    alt={step.title}
                    width={300}
                    height={300}
                    className="w-full h-auto object-contain"
                    loading="lazy"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Other Stylists Recommended — Loveable StylistMatch.tsx:213-254 */}
      {orderedOthers.length > 0 && (
        <section className="container max-w-5xl py-14 md:py-20">
          <h2 className="font-display text-3xl md:text-4xl text-center mb-10">
            Other Stylists Recommended for You
          </h2>

          <div className="flex flex-wrap justify-center gap-6 mb-10">
            {orderedOthers.map((profile) => {
              const otherFullName =
                `${profile.user.firstName} ${profile.user.lastName}`.trim();
              const otherFirstName = profile.user.firstName ?? otherFullName;
              return (
                <div
                  key={profile.id}
                  className="rounded-xl border border-border bg-card p-6 text-center w-[200px]"
                >
                  {profile.user.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.user.avatarUrl}
                      alt={otherFullName}
                      className="h-16 w-16 rounded-full object-cover mx-auto mb-3"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="h-16 w-16 rounded-full bg-muted mx-auto mb-3"
                    />
                  )}
                  <p className="font-display text-lg">{otherFirstName}</p>
                  <Link
                    href={`/stylists/${profile.id}`}
                    className="block w-full mt-4 rounded-md bg-foreground text-background py-2.5 text-xs font-body font-medium hover:bg-foreground/90 transition-colors"
                  >
                    Meet {otherFirstName}
                  </Link>
                </div>
              );
            })}
          </div>

          <div className="text-center">
            <Link
              href="/stylists"
              className="inline-flex items-center justify-center border border-foreground rounded-md px-8 py-3 font-body text-sm hover:bg-foreground hover:text-background transition-colors"
            >
              View More Stylists
            </Link>
          </div>
        </section>
      )}
      <SiteFooter />
    </div>
  );
}
