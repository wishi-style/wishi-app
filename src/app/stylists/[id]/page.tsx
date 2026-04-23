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
import { StarIcon } from "lucide-react";

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

  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personLd) }}
      />
      <SiteHeader />
      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-3xl px-6 md:px-10 py-12 md:py-16">
          {/* Header */}
          <header className="mb-8 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <div className="relative h-32 w-32 flex-shrink-0 overflow-hidden rounded-full bg-muted">
              {stylist.user.avatarUrl ? (
                <Image
                  src={stylist.user.avatarUrl}
                  alt={name}
                  fill
                  sizes="128px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-display text-4xl text-muted-foreground">
                  {initials}
                </div>
              )}
            </div>

            <div className="flex-1 text-center sm:text-left">
              <div className="flex items-center justify-center gap-3 sm:justify-start">
                <h1 className="font-display text-3xl md:text-4xl">{name}</h1>
                {clerkId && (
                  <FavoriteStylistButton
                    stylistProfileId={stylist.id}
                    initialFavorited={favorited}
                  />
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                {matchScore !== null && (
                  <span className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background">
                    {matchScore}% Match
                  </span>
                )}
                {stylist.yearsExperience && (
                  <span className="text-sm text-muted-foreground">
                    {stylist.yearsExperience}+ years experience
                  </span>
                )}
                {stylist.averageRating !== null &&
                  stylist.averageRating !== undefined && (
                    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                      <StarIcon className="h-3.5 w-3.5 fill-foreground text-foreground" />
                      {stylist.averageRating.toFixed(1)}
                    </span>
                  )}
                {!stylist.isAvailable && (
                  <span className="rounded-full border border-burgundy/40 bg-burgundy/10 px-3 py-1 text-xs text-burgundy">
                    Waitlist only
                  </span>
                )}
                {stylist.instagramHandle && (
                  <a
                    href={`https://instagram.com/${stylist.instagramHandle}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  >
                    @{stylist.instagramHandle}
                  </a>
                )}
              </div>
            </div>
          </header>

          {stylist.bio && (
            <section className="mb-6">
              <h2 className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                About
              </h2>
              <p className="text-sm leading-relaxed text-foreground">{stylist.bio}</p>
            </section>
          )}
          {stylist.philosophy && (
            <section className="mb-6">
              <h2 className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Style Philosophy
              </h2>
              <p className="text-sm leading-relaxed text-foreground">
                {stylist.philosophy}
              </p>
            </section>
          )}
          {stylist.directorPick && (
            <section className="mb-6 rounded-xl bg-cream p-4">
              <h2 className="mb-1 text-xs font-medium uppercase tracking-widest text-dark-taupe">
                Director&apos;s Pick
              </h2>
              <p className="text-sm italic text-dark-taupe">{stylist.directorPick}</p>
            </section>
          )}

          {stylist.styleSpecialties.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Specialties
              </h2>
              <div className="flex flex-wrap gap-2">
                {stylist.styleSpecialties.map((s: string) => (
                  <span
                    key={s}
                    className="rounded-full border border-border bg-background px-4 py-1.5 text-sm capitalize text-foreground"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </section>
          )}

          <div className="mb-12 flex gap-4">
            {stylist.isAvailable ? (
              <PillButton
                href={`/bookings/new?stylistId=${stylist.id}`}
                variant="solid"
                size="lg"
              >
                Book This Stylist
              </PillButton>
            ) : (
              <WaitlistButton stylistProfileId={stylist.id} />
            )}
          </div>

          {stylist.profileBoards.length > 0 && (
            <section className="mb-12">
              <h2 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Featured boards
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {stylist.profileBoards.map((b: (typeof stylist.profileBoards)[number]) => (
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
                      <div className="p-2 text-center text-xs text-muted-foreground capitalize">
                        {b.profileStyle.toLowerCase()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Reviews */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Reviews {totalReviews > 0 && `(${totalReviews})`}
              </h2>
              {canReview && (
                <WriteReviewDialog
                  stylistProfileId={stylist.id}
                  stylistFirstName={firstName}
                />
              )}
            </div>
            {reviews.length > 0 ? (
              <div className="space-y-4">
                {reviews.map((review) => (
                  <article
                    key={review.id}
                    className="rounded-xl border border-border bg-card p-4"
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
                    <p className="text-sm text-foreground leading-relaxed">
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
          </section>

          <div className="mt-12 text-center">
            <Link
              href="/stylists"
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              ← Back to all stylists
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
