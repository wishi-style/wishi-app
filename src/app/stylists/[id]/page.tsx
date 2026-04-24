import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth/server-auth";
import { cosmeticMatchScore } from "@/lib/matching/score";
import { WaitlistButton } from "@/components/stylist/waitlist-button";
import { FavoriteStylistButton } from "@/components/stylist/favorite-stylist-button";
import { isStylistFavorited } from "@/lib/stylists/favorite-stylist.service";
import { listStylistReviews } from "@/lib/stylists/review.service";
import { WriteReviewDialog } from "@/components/stylist/write-review-dialog";
import { SiteHeader } from "@/components/primitives/site-header";
import { SiteFooter } from "@/components/primitives/site-footer";
import { PillButton } from "@/components/primitives/pill-button";
import {
  StarIcon,
  ClockIcon,
  ShoppingBagIcon,
  ShieldCheckIcon,
  RepeatIcon,
  HeartIcon,
} from "lucide-react";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const stylist = await prisma.stylistProfile.findUnique({
    where: { id },
    select: {
      bio: true,
      philosophy: true,
      styleSpecialties: true,
      user: { select: { firstName: true, lastName: true, avatarUrl: true } },
    },
  });
  if (!stylist) {
    return { title: "Stylist not found" };
  }
  const name = `${stylist.user.firstName} ${stylist.user.lastName}`.trim();
  const specialties = stylist.styleSpecialties.slice(0, 3).join(", ");
  const description =
    stylist.bio ??
    stylist.philosophy ??
    (specialties
      ? `Wishi stylist ${name} — specialises in ${specialties}.`
      : `Wishi stylist ${name}.`);
  return {
    title: `${name} — Wishi Stylist`,
    description: description.slice(0, 200),
    openGraph: {
      title: `${name} — Wishi Stylist`,
      description: description.slice(0, 200),
      url: `/stylists/${id}`,
      type: "profile",
      ...(stylist.user.avatarUrl
        ? { images: [{ url: stylist.user.avatarUrl, alt: name }] }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: `${name} — Wishi Stylist`,
      description: description.slice(0, 200),
      ...(stylist.user.avatarUrl ? { images: [stylist.user.avatarUrl] } : {}),
    },
    alternates: { canonical: `/stylists/${id}` },
  };
}

export default async function StylistProfilePage({ params }: Props) {
  const { id } = await params;

  const stylist = await prisma.stylistProfile.findUnique({
    where: { id },
    include: {
      user: {
        select: { firstName: true, lastName: true, avatarUrl: true },
      },
      profileBoards: {
        where: { isFeaturedOnProfile: true, sessionId: null },
        include: { photos: { orderBy: { orderIndex: "asc" }, take: 1 } },
        orderBy: { createdAt: "desc" },
        take: 12,
      },
    },
  });

  if (!stylist) notFound();

  const name = `${stylist.user.firstName} ${stylist.user.lastName}`.trim();
  const firstName = stylist.user.firstName;
  const initials =
    `${stylist.user.firstName?.[0] ?? ""}${stylist.user.lastName?.[0] ?? ""}`.toUpperCase() ||
    name.charAt(0);

  const heroImage = stylist.profileBoards[0]?.photos[0]?.url ?? null;
  const additionalBoards = stylist.profileBoards.slice(heroImage ? 1 : 0);

  let matchScore: number | null = null;
  let favorited = false;
  let canReview = false;
  const { userId: clerkId } = await getServerAuth();
  if (clerkId) {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    if (user) {
      const [quizResult, isFav, completedCount] = await Promise.all([
        prisma.matchQuizResult.findFirst({
          where: { userId: user.id },
          orderBy: { completedAt: "desc" },
        }),
        isStylistFavorited(user.id, stylist.id),
        prisma.session.count({
          where: {
            clientId: user.id,
            stylistId: stylist.userId,
            status: "COMPLETED",
          },
        }),
      ]);
      if (quizResult) matchScore = cosmeticMatchScore(stylist, quizResult);
      favorited = isFav;
      canReview = completedCount > 0;
    }
  }

  const { reviews, total: totalReviews } = await listStylistReviews(stylist.id, {
    limit: 20,
  });

  const personLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name,
    jobTitle: "Personal Stylist",
    ...(stylist.user.avatarUrl ? { image: stylist.user.avatarUrl } : {}),
    ...(stylist.bio ? { description: stylist.bio } : {}),
    ...(stylist.styleSpecialties.length > 0
      ? { knowsAbout: stylist.styleSpecialties }
      : {}),
    worksFor: { "@type": "Organization", name: "Wishi" },
    ...(stylist.averageRating !== null && totalReviews > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: stylist.averageRating,
            reviewCount: totalReviews,
          },
        }
      : {}),
  };

  const trustItems = [
    {
      icon: ShoppingBagIcon,
      title: "Use any brand",
      desc: "From your fave to hidden gems — we work with your preferences, not our own bias.",
    },
    {
      icon: ShieldCheckIcon,
      title: "No commissions",
      desc: "We don't earn from what you buy. Our only goal is finding what works for you.",
    },
    {
      icon: RepeatIcon,
      title: "Switch anytime",
      desc: "Not the right fit? Change stylists at no cost. Your preference matters most.",
    },
    {
      icon: HeartIcon,
      title: "Shop your closet",
      desc: "We help you rediscover what you already own and style it in new ways.",
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personLd) }}
      />
      <SiteHeader />
      <main className="min-h-screen bg-background pb-20">
        {/* Hero */}
        <section className="container mx-auto max-w-5xl px-6 py-10 md:py-14">
          <div className="flex flex-col items-center gap-8 md:flex-row md:items-start md:gap-12">
            <div className="w-full overflow-hidden rounded-lg bg-muted md:w-[465px] md:flex-shrink-0">
              {heroImage ? (
                <Image
                  src={heroImage}
                  alt={`${name} portfolio`}
                  width={930}
                  height={930}
                  sizes="(min-width: 768px) 465px, 100vw"
                  className="aspect-square h-auto w-full object-cover"
                  priority
                />
              ) : stylist.user.avatarUrl ? (
                <Image
                  src={stylist.user.avatarUrl}
                  alt={name}
                  width={930}
                  height={930}
                  sizes="(min-width: 768px) 465px, 100vw"
                  className="aspect-square h-auto w-full object-cover"
                  priority
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center font-display text-6xl text-muted-foreground">
                  {initials}
                </div>
              )}
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="font-display text-4xl md:text-5xl">{name}</h1>
                {clerkId && (
                  <FavoriteStylistButton
                    stylistProfileId={stylist.id}
                    initialFavorited={favorited}
                  />
                )}
              </div>
              {stylist.yearsExperience && (
                <p className="mt-1 text-sm uppercase tracking-widest text-muted-foreground">
                  {stylist.yearsExperience}+ years experience
                </p>
              )}

              {matchScore !== null && (
                <div className="mt-6">
                  <div className="flex items-baseline gap-3">
                    <span className="font-display text-4xl">{matchScore}%</span>
                    <span className="text-sm text-muted-foreground">style match</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Based on your style and needs
                  </p>
                </div>
              )}

              {stylist.averageRating !== null && totalReviews > 0 && (
                <div className="mt-6 flex items-center gap-3">
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <StarIcon
                        key={i}
                        className="h-4 w-4 fill-foreground text-foreground"
                      />
                    ))}
                  </div>
                  <span className="text-sm font-medium">
                    {stylist.averageRating.toFixed(1)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {totalReviews} {totalReviews === 1 ? "Review" : "Reviews"}
                  </span>
                </div>
              )}

              {!stylist.isAvailable && (
                <div className="mt-6 flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                  <ClockIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    {firstName} is currently unavailable. Join the waitlist to be
                    notified when they&apos;re back.
                  </p>
                </div>
              )}

              <div className="mt-8 flex gap-4">
                {stylist.isAvailable ? (
                  <PillButton
                    href={`/bookings/new?stylistId=${stylist.id}`}
                    variant="solid"
                    size="lg"
                  >
                    Continue with {firstName}
                  </PillButton>
                ) : (
                  <WaitlistButton stylistProfileId={stylist.id} />
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Meet [Name] */}
        {(stylist.bio || stylist.directorPick || stylist.philosophy) && (
          <section className="border-t border-border">
            <div className="container mx-auto max-w-5xl px-6 py-10 md:py-14">
              <h2 className="mb-8 font-display text-2xl">Meet {firstName}</h2>

              <div className="grid gap-10 md:grid-cols-2">
                <div>
                  <div className="aspect-square overflow-hidden rounded-xl bg-muted">
                    {stylist.user.avatarUrl ? (
                      <Image
                        src={stylist.user.avatarUrl}
                        alt={name}
                        width={600}
                        height={600}
                        sizes="(min-width: 768px) 50vw, 100vw"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center font-display text-5xl text-muted-foreground">
                        {initials}
                      </div>
                    )}
                  </div>
                  {stylist.instagramHandle && (
                    <a
                      href={`https://instagram.com/${stylist.instagramHandle}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    >
                      @{stylist.instagramHandle}
                    </a>
                  )}
                </div>

                <div className="space-y-6">
                  {stylist.bio && (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        My Approach
                      </p>
                      <p className="text-sm leading-relaxed text-foreground">
                        {stylist.bio}
                      </p>
                    </div>
                  )}

                  {stylist.directorPick && (
                    <div className="border-l-2 border-secondary pl-4">
                      <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        Director&apos;s Pick
                      </p>
                      <p className="text-sm italic leading-relaxed text-foreground">
                        “{stylist.directorPick}”
                      </p>
                    </div>
                  )}

                  {stylist.philosophy && (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        Style Philosophy
                      </p>
                      <p className="text-sm leading-relaxed text-foreground">
                        {stylist.philosophy}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {stylist.styleSpecialties.length > 0 && (
          <section className="border-t border-border">
            <div className="container mx-auto max-w-5xl px-6 py-10 md:py-14">
              <h2 className="mb-3 text-center font-display text-2xl">
                Why {firstName}?
              </h2>
              <p className="mb-6 text-center text-xs text-muted-foreground">
                Good for:
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {stylist.styleSpecialties.map((s: string) => (
                  <span
                    key={s}
                    className="rounded-full bg-foreground px-4 py-1.5 text-xs font-medium capitalize text-background"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        {additionalBoards.length > 0 && (
          <section className="border-t border-border">
            <div className="container mx-auto max-w-5xl px-6 py-10 md:py-14">
              <h2 className="mb-6 text-center font-display text-2xl">
                Styled by {firstName}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {additionalBoards.map((b) => (
                  <div
                    key={b.id}
                    className="overflow-hidden rounded-xl border border-border bg-card"
                  >
                    {b.photos[0]?.url ? (
                      <Image
                        src={b.photos[0].url}
                        alt={b.profileStyle ?? "profile board"}
                        width={400}
                        height={400}
                        sizes="(min-width: 640px) 33vw, 50vw"
                        className="aspect-square w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-square items-center justify-center text-xs text-muted-foreground">
                        {b.profileStyle ?? ""}
                      </div>
                    )}
                    {b.profileStyle && (
                      <div className="p-2 text-center text-xs capitalize text-muted-foreground">
                        {b.profileStyle.toLowerCase()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Reviews */}
        <section className="border-t border-border">
          <div className="container mx-auto max-w-5xl px-6 py-10 md:py-14">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-display text-xl">
                What {firstName}&apos;s clients say
              </h2>
              {canReview && (
                <WriteReviewDialog
                  stylistProfileId={stylist.id}
                  stylistFirstName={firstName}
                />
              )}
            </div>
            {reviews.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {reviews.map((review) => (
                  <article
                    key={review.id}
                    className="rounded-xl border border-border bg-card p-5"
                  >
                    <header className="mb-2 flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {review.author.firstName} {review.author.lastNameInitial}.
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-xs text-foreground">
                        {Array.from({ length: review.rating }).map((_, i) => (
                          <StarIcon
                            key={i}
                            className="h-3 w-3 fill-foreground text-foreground"
                          />
                        ))}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {review.createdAt.toLocaleDateString()}
                      </span>
                    </header>
                    <p className="text-sm leading-relaxed text-foreground">
                      {review.reviewText}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No reviews yet.
                {canReview && " Be the first to share your experience."}
              </p>
            )}

            {totalReviews > reviews.length && (
              <div className="mt-6">
                <Link
                  href={`/stylists/${stylist.id}/reviews`}
                  className="inline-flex items-center rounded-full border border-foreground px-6 py-2 text-sm font-medium text-foreground transition-colors hover:bg-foreground hover:text-background"
                >
                  Show all {totalReviews} reviews
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Trust */}
        <section className="bg-foreground py-14 text-background md:py-20">
          <div className="container mx-auto max-w-4xl px-6">
            <h2 className="mb-12 text-center font-display text-2xl md:text-3xl">
              A styling experience built on trust
            </h2>
            <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
              {trustItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="text-center">
                    <Icon className="mx-auto mb-3 h-6 w-6 text-background/80" />
                    <h3 className="mb-2 font-display text-sm">{item.title}</h3>
                    <p className="text-xs leading-relaxed text-background/60">
                      {item.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <div className="border-t border-border bg-background py-10 text-center">
          <Link
            href="/stylists"
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            ← Back to all stylists
          </Link>
        </div>
      </main>

      {/* Sticky bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background">
        <div className="container mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-muted">
              {stylist.user.avatarUrl ? (
                <Image
                  src={stylist.user.avatarUrl}
                  alt={name}
                  fill
                  sizes="40px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-medium text-muted-foreground">
                  {initials}
                </div>
              )}
            </div>
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="text-xs text-muted-foreground">
                {stylist.isAvailable
                  ? "Responds within 10 hours"
                  : "Currently unavailable"}
              </p>
            </div>
          </div>
          {stylist.isAvailable ? (
            <PillButton
              href={`/bookings/new?stylistId=${stylist.id}`}
              variant="solid"
              size="md"
            >
              Continue with {firstName}
            </PillButton>
          ) : (
            <WaitlistButton stylistProfileId={stylist.id} />
          )}
        </div>
      </div>

      <SiteFooter />
    </>
  );
}
