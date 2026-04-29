import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SparklesIcon, SearchIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { SiteHeader } from "@/components/primitives/site-header";
import { SiteFooter } from "@/components/primitives/site-footer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Discover Our Stylists — Wishi",
  description:
    "Browse our curated roster of expert stylists. Take a quick style match quiz and we'll match you with the stylists who truly get your vibe.",
};

interface Props {
  searchParams: Promise<{ q?: string }>;
}

interface DiscoverStylist {
  id: string;
  name: string;
  initials: string;
  location: string;
  specialty: string;
  avatarUrl: string | null;
  portfolioUrl: string | null;
}

function DiscoverStylistCard({ stylist }: { stylist: DiscoverStylist }) {
  return (
    <Link href={`/stylists/${stylist.id}`} className="group block">
      <div className="relative aspect-square overflow-hidden">
        {stylist.portfolioUrl ? (
          <Image
            src={stylist.portfolioUrl}
            alt={`${stylist.name}'s portfolio`}
            width={640}
            height={640}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full bg-muted" />
        )}
      </div>

      <div className="flex flex-col items-center text-center bg-card px-4 py-5">
        <Avatar className="h-12 w-12 mb-2 border-2 border-background shadow-sm -mt-10">
          {stylist.avatarUrl ? (
            <AvatarImage src={stylist.avatarUrl} alt={stylist.name} />
          ) : null}
          <AvatarFallback className="font-body text-xs bg-secondary text-secondary-foreground">
            {stylist.initials}
          </AvatarFallback>
        </Avatar>
        <h3 className="font-display text-lg">{stylist.name}</h3>
        {stylist.location ? (
          <p className="font-body text-xs uppercase tracking-widest text-dark-taupe mt-0.5">
            {stylist.location}
          </p>
        ) : null}
        {stylist.specialty ? (
          <p className="font-body text-xs text-muted-foreground mt-1">
            {stylist.specialty}
          </p>
        ) : null}
        <span className="mt-3 w-full max-w-[220px] rounded-full border border-foreground text-foreground py-2.5 text-sm font-body font-medium group-hover:bg-foreground group-hover:text-background transition-colors text-center block">
          View Profile
        </span>
      </div>
    </Link>
  );
}

export default async function DiscoverPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";

  const where: Record<string, unknown> = {
    matchEligible: true,
    user: { deletedAt: null },
  };
  if (q) {
    where.OR = [
      { user: { firstName: { contains: q, mode: "insensitive" } } },
      { user: { lastName: { contains: q, mode: "insensitive" } } },
    ];
  }

  const stylists = await prisma.stylistProfile.findMany({
    where,
    include: {
      user: {
        select: {
          firstName: true,
          lastName: true,
          avatarUrl: true,
          locations: {
            where: { isPrimary: true },
            select: { city: true, state: true, country: true },
            take: 1,
          },
        },
      },
      profileBoards: {
        where: { isFeaturedOnProfile: true, sessionId: null },
        include: { photos: { orderBy: { orderIndex: "asc" }, take: 1 } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { totalSessionsCompleted: "desc" },
  });

  const cards: DiscoverStylist[] = stylists.map((s) => {
    const firstName = s.user.firstName ?? "";
    const lastName = s.user.lastName ?? "";
    const fullName = `${firstName} ${lastName}`.trim() || "Stylist";
    const initials =
      `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase() || "?";
    const primary = s.user.locations[0];
    const location = primary
      ? [primary.city, primary.state ?? primary.country]
          .filter(Boolean)
          .join(", ")
      : "";
    const specialty = s.styleSpecialties[0] ?? "";
    const portfolioUrl = s.profileBoards[0]?.photos[0]?.url ?? null;

    return {
      id: s.id,
      name: fullName,
      initials,
      location,
      specialty,
      avatarUrl: s.user.avatarUrl,
      portfolioUrl,
    };
  });

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background">
        {/* Hero CTA banner */}
        <section className="border-b border-border bg-muted/40">
          <div className="mx-auto max-w-3xl px-6 md:px-10 py-12 md:py-16 text-center">
            <h1 className="font-display text-3xl md:text-4xl mb-3">
              Find Your Perfect Stylist
            </h1>
            <p className="font-body text-base text-muted-foreground max-w-md mx-auto mb-6">
              Take a quick style quiz and we&apos;ll match you with the stylists
              who truly get your vibe.
            </p>
            {/* Loveable's `/discover` points this CTA at `/how-it-works`,
                but its sibling page `/stylists` (rebuild-only addition)
                already routes the same "Take Your Style Match" copy at
                `/match-quiz`. Aligning here so both stylist-discovery
                surfaces send the user straight to the quiz, since the
                CTA copy promises the quiz, not the explainer. */}
            <Link
              href="/match-quiz"
              className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-8 py-3 text-sm font-body font-medium hover:bg-foreground/90 transition-colors"
            >
              <SparklesIcon className="h-4 w-4" />
              Take Your Style Match
            </Link>
          </div>
        </section>

        {/* Discover Stylists */}
        <section className="mx-auto max-w-5xl px-6 md:px-10 py-12 md:py-16">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div>
              <h2 className="font-display text-2xl md:text-3xl">
                Discover Our Stylists
              </h2>
              <p className="font-body text-sm text-muted-foreground mt-1">
                Browse our curated roster of expert stylists.
              </p>
            </div>

            <form
              action="/discover"
              method="GET"
              className="relative w-full sm:w-64"
              role="search"
            >
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Search stylists by name"
                aria-label="Search stylists by name"
                className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm font-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
              />
            </form>
          </div>

          {cards.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {cards.map((s) => (
                <DiscoverStylistCard key={s.id} stylist={s} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <p className="font-body text-sm text-muted-foreground">
                No stylists found matching your search.
              </p>
            </div>
          )}
        </section>

        {/* Bottom CTA */}
        <section className="border-t border-border bg-muted/40">
          <div className="mx-auto max-w-2xl px-6 md:px-10 py-12 text-center">
            <h3 className="font-display text-2xl mb-2">Ready to get styled?</h3>
            <p className="font-body text-sm text-muted-foreground mb-5">
              Take a 2-minute style quiz and get matched with your ideal
              stylist.
            </p>
            {/* Loveable's `/discover` points this CTA at `/how-it-works`,
                but its sibling page `/stylists` (rebuild-only addition)
                already routes the same "Take Your Style Match" copy at
                `/match-quiz`. Aligning here so both stylist-discovery
                surfaces send the user straight to the quiz, since the
                CTA copy promises the quiz, not the explainer. */}
            <Link
              href="/match-quiz"
              className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-8 py-3 text-sm font-body font-medium hover:bg-foreground/90 transition-colors"
            >
              <SparklesIcon className="h-4 w-4" />
              Take Your Style Match
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
