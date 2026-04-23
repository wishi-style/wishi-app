import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { StarIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { cosmeticMatchScore } from "@/lib/matching/score";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { PillButton } from "@/components/primitives/pill-button";
import { Reveal } from "@/components/primitives/reveal";
import { PortfolioCarousel } from "./portfolio-carousel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your match — Wishi",
  description:
    "We found your perfect Wishi stylist match — based on your style quiz.",
};

const howItWorksSteps = [
  { num: 1, title: "Get matched with A-list stylists", image: "/img/hiw-step1-match.png" },
  { num: 2, title: "Book an online session", image: "/img/hiw-step2-plan.png" },
  { num: 3, title: "Receive personalized shoppable looks", image: "/img/hiw-step3-session.png" },
  { num: 4, title: "Buy what you love on Wishi", image: "/img/hiw-step4-shop.png" },
] as const;

export default async function MatchesPage() {
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
      profileBoards: {
        where: { isFeaturedOnProfile: true, sessionId: null },
        include: { photos: { orderBy: { orderIndex: "asc" }, take: 1 } },
        orderBy: { createdAt: "desc" },
        take: 6,
      },
      _count: { select: { reviews: true } },
    },
  });

  const scored = stylists
    .map((s) => ({
      ...s,
      score: cosmeticMatchScore(s, quizResult),
      name: `${s.user.firstName ?? ""} ${s.user.lastName ?? ""}`.trim(),
      portfolioImages: s.profileBoards
        .flatMap((b) => b.photos.map((p) => p.url))
        .filter((u): u is string => Boolean(u))
        .slice(0, 4),
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  if (scored.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-3xl px-6 md:px-10 py-20 text-center">
          <h1 className="font-display text-3xl md:text-4xl mb-4">
            No matches just yet
          </h1>
          <p className="text-sm text-muted-foreground mb-8">
            We couldn&apos;t find a stylist that matches your quiz answers right
            now. Browse the full roster — your perfect stylist might already be
            there.
          </p>
          <PillButton href="/stylists" variant="solid" size="md">
            Browse all stylists
          </PillButton>
        </div>
      </div>
    );
  }

  const top = scored[0];
  const alternates = scored.slice(1, 4);
  const firstName = top.name.split(" ")[0] || top.name;
  const initials =
    `${top.user.firstName?.[0] ?? ""}${top.user.lastName?.[0] ?? ""}`.toUpperCase() ||
    top.name.charAt(0);

  // Fall back to avatar as the only portfolio image when no profile boards
  // have been featured yet — keeps the carousel visually populated for new
  // stylists rather than showing an empty pane.
  const carouselImages =
    top.portfolioImages.length > 0
      ? top.portfolioImages
      : top.user.avatarUrl
        ? [top.user.avatarUrl]
        : [];

  return (
    <div className="min-h-screen bg-background">
      {/* ─── Hero: We Found Your Perfect Match ─── */}
      <section className="bg-background text-foreground py-14 md:py-20">
        <div className="mx-auto max-w-5xl px-6 md:px-10">
          <Reveal>
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl text-center mb-3 tracking-tight">
              We Found Your
            </h1>
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl italic text-center mb-12 tracking-tight">
              Perfect Match
            </h1>
          </Reveal>

          <Reveal delay={120}>
            <div className="rounded-2xl bg-background text-foreground overflow-hidden shadow-2xl border border-border">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                {/* Left: Stylist Info */}
                <div className="p-8 md:p-10 lg:p-12 flex flex-col justify-center">
                  <div className="flex items-center gap-5 mb-6">
                    <Avatar className="h-20 w-20 ring-2 ring-foreground/10">
                      {top.user.avatarUrl ? (
                        <AvatarImage src={top.user.avatarUrl} alt={top.name} />
                      ) : null}
                      <AvatarFallback className="text-lg bg-secondary text-secondary-foreground">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h2 className="font-display text-3xl tracking-tight">
                        {top.name}
                      </h2>
                      {!top.isAvailable && (
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mt-1">
                          Currently on waitlist
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-5 mb-6 flex-wrap">
                    {top.score !== null && top.score !== undefined && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-4 py-1.5 text-xs font-semibold">
                        {top.score}% Match
                      </span>
                    )}
                    {top.averageRating !== null &&
                      top.averageRating !== undefined && (
                        <span className="inline-flex items-center gap-1 text-sm text-foreground">
                          <StarIcon className="h-4 w-4 fill-foreground text-foreground" />
                          <span className="font-semibold">
                            {top.averageRating.toFixed(1)}
                          </span>
                          {top._count.reviews > 0 && (
                            <Link
                              href={`/stylists/${top.id}`}
                              className="text-muted-foreground underline underline-offset-2"
                            >
                              {top._count.reviews}{" "}
                              {top._count.reviews === 1 ? "review" : "reviews"}
                            </Link>
                          )}
                        </span>
                      )}
                  </div>

                  {top.bio && (
                    <div className="mb-6">
                      <p className="font-display text-base mb-2">
                        Why {firstName}?
                      </p>
                      <p className="text-sm text-foreground/70 leading-relaxed">
                        {top.bio}
                      </p>
                    </div>
                  )}

                  {top.styleSpecialties.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-6">
                      {top.styleSpecialties.slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-foreground/20 bg-secondary/50 px-4 py-1.5 text-xs font-medium text-foreground/80 capitalize"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {top.totalSessionsCompleted > 0 && (
                    <p className="text-xs text-muted-foreground mb-7 tracking-wide">
                      {top.totalSessionsCompleted.toLocaleString()} sessions
                      completed
                    </p>
                  )}

                  <PillButton
                    href={`/bookings/new?stylistId=${top.id}`}
                    variant="solid"
                    size="md"
                    className="w-full md:w-auto"
                  >
                    Continue with {firstName}
                  </PillButton>
                </div>

                {/* Right: Portfolio Carousel */}
                <div className="relative bg-muted">
                  {carouselImages.length > 0 ? (
                    <PortfolioCarousel
                      images={carouselImages}
                      alt={`${top.name}'s`}
                    />
                  ) : (
                    <div className="aspect-square flex items-center justify-center text-muted-foreground text-sm">
                      Portfolio coming soon
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-5xl px-6 md:px-10 py-14 md:py-20">
          <h2 className="font-display text-3xl md:text-4xl text-center mb-12">
            How it Works
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {howItWorksSteps.map((step, i) => (
              <Reveal key={step.num} delay={i * 80}>
                <div className="text-center">
                  <p className="font-display text-3xl mb-2">{step.num}</p>
                  <p className="text-sm text-foreground/80 mb-5 leading-snug min-h-[40px]">
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
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Other Stylists Recommended ─── */}
      {alternates.length > 0 && (
        <section className="mx-auto max-w-5xl px-6 md:px-10 py-14 md:py-20">
          <h2 className="font-display text-3xl md:text-4xl text-center mb-10">
            Other Stylists Recommended for You
          </h2>

          <div className="flex flex-wrap justify-center gap-6 mb-10">
            {alternates.map((s, i) => {
              const altInitials =
                `${s.user.firstName?.[0] ?? ""}${s.user.lastName?.[0] ?? ""}`.toUpperCase() ||
                s.name.charAt(0);
              const altFirstName = s.name.split(" ")[0] || s.name;
              return (
                <Reveal key={s.id} delay={i * 70}>
                  <div className="rounded-xl border border-border bg-card p-6 text-center w-[220px]">
                    <Avatar className="h-16 w-16 mx-auto mb-3">
                      {s.user.avatarUrl ? (
                        <AvatarImage src={s.user.avatarUrl} alt={s.name} />
                      ) : null}
                      <AvatarFallback className="bg-secondary text-secondary-foreground">
                        {altInitials}
                      </AvatarFallback>
                    </Avatar>
                    <p className="font-display text-lg">{s.name}</p>
                    {s.score !== null && s.score !== undefined && (
                      <p className="text-xs text-muted-foreground mb-4">
                        {s.score}% match
                      </p>
                    )}
                    <PillButton
                      href={`/stylists/${s.id}`}
                      variant="solid"
                      size="sm"
                      className="w-full"
                    >
                      Meet {altFirstName}
                    </PillButton>
                  </div>
                </Reveal>
              );
            })}
          </div>

          <div className="text-center">
            <PillButton href="/stylists" variant="outline" size="md">
              View More Stylists
            </PillButton>
          </div>
        </section>
      )}
    </div>
  );
}
