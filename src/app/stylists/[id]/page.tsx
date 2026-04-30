import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth/server-auth";
import { cosmeticMatchScore } from "@/lib/matching/score";
import { WaitlistButton } from "@/components/stylist/waitlist-button";
import { listStylistReviews } from "@/lib/stylists/review.service";
import { WriteReviewDialog } from "@/components/stylist/write-review-dialog";
import { SiteHeader } from "@/components/primitives/site-header";
import { SiteFooter } from "@/components/primitives/site-footer";
import { ContinueWithStylistButton } from "./continue-with-stylist-button";
import {
  StarIcon,
  ClockIcon,
  ShoppingBagIcon,
  ShieldCheckIcon,
  RepeatIcon,
  HeartIcon,
} from "lucide-react";

// Lucide 1.x dropped brand glyphs (per CLAUDE.md). Inline SVG matches
// Loveable's Instagram icon dimensions + stroke.
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

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
  const styledLooks = stylist.profileBoards.slice(heroImage ? 1 : 0).slice(0, 4);

  let matchScore: number | null = null;
  let canReview = false;
  const { userId: clerkId } = await getServerAuth().catch(() => ({
    userId: null as string | null,
  }));
  const signedIn = Boolean(clerkId);
  if (clerkId) {
    try {
      const user = await prisma.user.findUnique({
        where: { clerkId },
        select: { id: true },
      });
      if (user) {
        const [quizResult, completedCount] = await Promise.all([
          prisma.matchQuizResult
            .findFirst({
              where: { userId: user.id },
              orderBy: { completedAt: "desc" },
            })
            .catch(() => null),
          prisma.session
            .count({
              where: {
                clientId: user.id,
                stylistId: stylist.userId,
                status: "COMPLETED",
              },
            })
            .catch(() => 0),
        ]);
        if (quizResult) matchScore = cosmeticMatchScore(stylist, quizResult);
        canReview = completedCount > 0;
      }
    } catch (err) {
      console.error("[stylists/[id]] authed enrichment failed", err);
    }
  }

  const { reviews, total: totalReviews } = await listStylistReviews(stylist.id, {
    limit: 20,
  }).catch((err) => {
    console.error("[stylists/[id]] listStylistReviews failed", err);
    return { reviews: [], total: 0 };
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
      desc: "We help you rediscover what you already own and fit it in new styles.",
    },
  ];

  // "What you'll get" — Loveable StylistProfile.tsx:638-663.
  const whatYouGetSteps = [
    {
      num: "01",
      title: "Share your needs",
      desc: "Tell us about your lifestyle, body, preferences, brands, occasions, goals, and budget.",
    },
    {
      num: "02",
      title: "Receive personalized looks",
      desc: "Get a curated selection of shoppable outfits tailored to your style and budget.",
    },
    {
      num: "03",
      title: "Refine & shop confidently",
      desc: "Give feedback to fine-tune your looks, then shop knowing every piece was handpicked for you.",
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
      <div className="min-h-screen bg-background">
        {/* Hero — Loveable StylistProfile.tsx:285-346 */}
        <section className="bg-background container max-w-5xl py-10 md:py-14">
          <div className="flex flex-col md:flex-row gap-8 md:gap-12 items-center">
            <div className="w-full md:w-[465px] shrink-0 overflow-hidden rounded-lg bg-muted">
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
              <h1 className="font-display text-4xl md:text-5xl mb-1">{name}</h1>
              {stylist.yearsExperience ? (
                <p className="font-body text-sm uppercase tracking-widest text-muted-foreground mb-5">
                  {stylist.yearsExperience}+ years experience
                </p>
              ) : (
                <p className="mb-5" aria-hidden />
              )}

              {matchScore !== null ? (
                <>
                  <div className="flex items-baseline gap-3 mb-1">
                    <span className="font-display text-4xl">{matchScore}%</span>
                    <span className="font-body text-sm text-muted-foreground">
                      style match
                    </span>
                  </div>
                  <p className="font-body text-xs text-muted-foreground mb-5">
                    Based on your style and needs
                  </p>
                </>
              ) : null}

              {stylist.averageRating !== null && totalReviews > 0 ? (
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <StarIcon
                        key={i}
                        className="h-4 w-4 fill-foreground text-foreground"
                      />
                    ))}
                  </div>
                  <span className="font-body text-sm font-medium">
                    {stylist.averageRating.toFixed(1)}
                  </span>
                  <span className="font-body text-xs text-muted-foreground">
                    {totalReviews} {totalReviews === 1 ? "Review" : "Reviews"}
                  </span>
                </div>
              ) : null}

              {!stylist.isAvailable ? (
                <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-muted">
                  <ClockIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <p className="font-body text-xs text-muted-foreground">
                    {firstName} is currently unavailable. Join the waitlist to be
                    notified when they&apos;re back.
                  </p>
                </div>
              ) : null}

              {stylist.isAvailable ? (
                <ContinueWithStylistButton
                  stylistProfileId={stylist.id}
                  firstName={firstName}
                  signedIn={signedIn}
                  size="lg"
                />
              ) : (
                <WaitlistButton stylistProfileId={stylist.id} />
              )}
            </div>
          </div>
        </section>

        {/* Meet [Name] — Loveable StylistProfile.tsx:349-424 */}
        {(stylist.bio || stylist.directorPick || stylist.philosophy) && (
          <section className="border-t border-border">
            <div className="container max-w-5xl py-10 md:py-14">
              <h2 className="font-display text-2xl mb-8">Meet {firstName}</h2>

              <div className="grid md:grid-cols-2 gap-10">
                <div>
                  <div className="overflow-hidden rounded-xl aspect-square bg-muted">
                    {stylist.user.avatarUrl ? (
                      <Image
                        src={stylist.user.avatarUrl}
                        alt={name}
                        width={600}
                        height={600}
                        sizes="(min-width: 768px) 50vw, 100vw"
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center font-display text-5xl text-muted-foreground">
                        {initials}
                      </div>
                    )}
                  </div>
                  {stylist.instagramHandle ? (
                    <div className="flex items-center gap-4 mt-3">
                      <a
                        href={`https://instagram.com/${stylist.instagramHandle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={`${name} on Instagram`}
                      >
                        <InstagramIcon className="h-5 w-5" />
                      </a>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-6">
                  {stylist.bio ? (
                    <div>
                      <p className="font-body text-xs uppercase tracking-widest text-muted-foreground mb-2">
                        My Approach
                      </p>
                      <p className="font-body text-sm text-foreground leading-relaxed">
                        {stylist.bio}
                      </p>
                    </div>
                  ) : null}

                  {stylist.directorPick ? (
                    <div className="border-l-2 border-secondary pl-4">
                      <p className="font-body text-xs uppercase tracking-widest text-muted-foreground mb-2">
                        Client Spotlight
                      </p>
                      <p className="font-body text-sm italic text-foreground leading-relaxed">
                        &ldquo;{stylist.directorPick}&rdquo;
                      </p>
                    </div>
                  ) : null}

                  {stylist.philosophy ? (
                    <div>
                      <p className="font-body text-xs uppercase tracking-widest text-muted-foreground mb-2">
                        Bio
                      </p>
                      <p className="font-body text-sm text-foreground leading-relaxed">
                        {stylist.philosophy}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Styled by — Loveable StylistProfile.tsx:427-452. 2-col grid with
            caption above each image. */}
        {styledLooks.length > 0 && (
          <section className="border-t border-border">
            <div className="container max-w-5xl py-10 md:py-14">
              <h2 className="font-display text-2xl text-center mb-8">
                Styled by {firstName}
              </h2>
              <div className="grid grid-cols-2 gap-4 justify-items-center">
                {styledLooks.map((look) => {
                  const caption = look.profileStyle
                    ? look.profileStyle.toString().toLowerCase()
                    : "";
                  return (
                    <div key={look.id} className="w-[450px] max-w-full">
                      {caption ? (
                        <p className="font-body text-xs uppercase tracking-widest text-muted-foreground mb-2">
                          {caption}
                        </p>
                      ) : null}
                      <div className="aspect-square overflow-hidden group cursor-pointer">
                        {look.photos[0]?.url ? (
                          <Image
                            src={look.photos[0].url}
                            alt={caption || "styled look"}
                            width={450}
                            height={450}
                            sizes="(min-width: 768px) 450px, 100vw"
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                            {caption}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Why this stylist — Loveable StylistProfile.tsx:455-484 */}
        {stylist.styleSpecialties.length > 0 && (
          <section className="border-t border-border">
            <div className="container max-w-5xl py-10 md:py-14">
              <h2 className="font-display text-2xl text-center mb-3">
                Why {firstName}?
              </h2>
              <p className="font-body text-xs text-muted-foreground text-center mb-4">
                Good for:
              </p>

              <div className="flex flex-wrap justify-center gap-2 mb-8">
                {stylist.styleSpecialties.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-foreground text-background px-4 py-1.5 text-xs font-body font-medium capitalize"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {stylist.bodySpecialties.length > 0 ? (
                <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                  {stylist.bodySpecialties.map((spec) => (
                    <div key={spec} className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-foreground shrink-0" />
                      <span className="font-body text-sm text-foreground capitalize">
                        {spec}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        )}

        {/* Client Reviews — Loveable StylistProfile.tsx:487-601 */}
        <section className="border-t border-border">
          <div className="container max-w-5xl py-10 md:py-14">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
              <h2 className="font-display text-xl">
                What {firstName}&apos;s clients say
              </h2>
              <div className="flex items-center gap-3 flex-wrap">
                {stylist.averageRating !== null && totalReviews > 0 ? (
                  <div className="flex items-center gap-2">
                    <StarIcon className="h-4 w-4 fill-foreground text-foreground" />
                    <span className="font-body text-sm font-medium">
                      {stylist.averageRating.toFixed(1)}
                    </span>
                    <span className="font-body text-xs text-muted-foreground">
                      See Reviews
                    </span>
                  </div>
                ) : null}
                {canReview ? (
                  <WriteReviewDialog
                    stylistProfileId={stylist.id}
                    stylistFirstName={firstName}
                  />
                ) : null}
              </div>
            </div>

            {reviews.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {reviews.slice(0, 4).map((review) => {
                  const reviewerName =
                    `${review.author.firstName} ${review.author.lastNameInitial}.`.trim();
                  const reviewerInitial =
                    review.author.firstName?.[0]?.toUpperCase() ?? "?";
                  return (
                    <div key={review.id} className="rounded-xl bg-background p-5">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted font-body text-xs text-foreground">
                          {reviewerInitial}
                        </div>
                        <span className="font-body text-sm font-medium">
                          {reviewerName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex gap-0.5">
                          {Array.from({ length: review.rating }).map((_, j) => (
                            <StarIcon
                              key={j}
                              className="h-3 w-3 fill-foreground text-foreground"
                            />
                          ))}
                        </div>
                        <span className="font-body text-xs text-muted-foreground">
                          {review.createdAt.toLocaleDateString()}
                        </span>
                      </div>
                      <p className="font-body text-sm text-foreground leading-relaxed">
                        {review.reviewText}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="font-body text-sm text-muted-foreground">
                No reviews yet.
                {canReview ? " Be the first to share your experience." : ""}
              </p>
            )}

            {totalReviews > 0 ? (
              <a
                href={`/stylists/${stylist.id}/reviews`}
                className="mt-6 inline-block rounded-full border border-foreground px-6 py-2 text-sm font-body font-medium text-foreground hover:bg-foreground hover:text-background transition-colors"
              >
                Show all {totalReviews} reviews
              </a>
            ) : null}
          </div>
        </section>

        {/* Trust section — Loveable StylistProfile.tsx:612-635 */}
        <section className="bg-foreground text-background py-14 md:py-20">
          <div className="container max-w-4xl">
            <h2 className="font-display text-2xl md:text-3xl text-center mb-12">
              A styling experience built on trust
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {trustItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="text-center">
                    <Icon className="h-6 w-6 mx-auto mb-3 text-background/80" />
                    <h3 className="font-display text-sm mb-2">{item.title}</h3>
                    <p className="font-body text-xs text-background/60 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* What you'll get — Loveable StylistProfile.tsx:638-663 */}
        <section className="bg-muted/50 py-14 md:py-20">
          <div className="container max-w-4xl text-center">
            <h2 className="font-display text-2xl md:text-3xl mb-3">
              What you&apos;ll get
            </h2>
            <p className="font-body text-sm text-muted-foreground mb-12 max-w-lg mx-auto">
              A personal styling experience designed to give you clarity and
              confidence.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
              {whatYouGetSteps.map((step) => (
                <div key={step.num}>
                  <span className="font-display text-3xl md:text-4xl text-secondary-foreground/30">
                    {step.num}
                  </span>
                  <h3 className="font-display text-base md:text-lg mt-2 mb-2">
                    {step.title}
                  </h3>
                  <p className="font-body text-xs text-muted-foreground leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Sticky bottom bar — Loveable StylistProfile.tsx:665-698 */}
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border">
          <div className="container max-w-5xl flex items-center justify-between gap-3 py-3 px-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative h-8 w-8 sm:h-10 sm:w-10 shrink-0 overflow-hidden rounded-full bg-muted">
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
              <div className="min-w-0 hidden sm:block">
                <p className="font-body text-sm font-medium truncate">{name}</p>
                <p className="font-body text-xs text-muted-foreground">
                  {stylist.isAvailable
                    ? "Responds within 10 hours"
                    : "Currently unavailable"}
                </p>
              </div>
            </div>
            {stylist.isAvailable ? (
              <ContinueWithStylistButton
                stylistProfileId={stylist.id}
                firstName={firstName}
                signedIn={signedIn}
                size="md"
              />
            ) : (
              <WaitlistButton stylistProfileId={stylist.id} />
            )}
          </div>
        </div>

        {/* Spacer for sticky bar */}
        <div className="h-16" />
      </div>
      <SiteFooter />
    </>
  );
}
