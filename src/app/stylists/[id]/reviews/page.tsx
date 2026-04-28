import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeftIcon, StarIcon } from "lucide-react";
import { SiteHeader } from "@/components/primitives/site-header";
import { SiteFooter } from "@/components/primitives/site-footer";
import { prisma } from "@/lib/prisma";
import { listStylistReviews } from "@/lib/stylists/review.service";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const profile = await prisma.stylistProfile.findUnique({
    where: { id },
    select: { user: { select: { firstName: true, lastName: true } } },
  });
  if (!profile) return { title: "Stylist reviews — Wishi" };
  const name = `${profile.user.firstName} ${profile.user.lastName}`.trim();
  return {
    title: `Reviews of ${name} — Wishi`,
    description: `What ${profile.user.firstName}'s clients say about working with her on Wishi.`,
    alternates: { canonical: `/stylists/${id}/reviews` },
  };
}

export default async function StylistReviewsPage({ params }: Props) {
  const { id } = await params;

  const profile = await prisma.stylistProfile.findUnique({
    where: { id },
    select: {
      id: true,
      averageRating: true,
      user: {
        select: { firstName: true, lastName: true, avatarUrl: true },
      },
    },
  });
  if (!profile) notFound();

  const firstName = profile.user.firstName;
  const fullName = `${profile.user.firstName} ${profile.user.lastName}`.trim();

  const { reviews, total } = await listStylistReviews(profile.id, {
    limit: 100,
  });

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-muted/30">
        <div className="container mx-auto max-w-3xl px-6 py-10 md:py-14">
          <Link
            href={`/stylists/${profile.id}`}
            className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to {firstName}&apos;s profile
          </Link>

          <header className="mb-8 flex items-center gap-4">
            <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-full bg-muted">
              {profile.user.avatarUrl ? (
                <Image
                  src={profile.user.avatarUrl}
                  alt={fullName}
                  fill
                  sizes="56px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-display text-lg text-muted-foreground">
                  {firstName.charAt(0)}
                </div>
              )}
            </div>
            <div>
              <h1 className="font-display text-2xl md:text-3xl">
                What {firstName}&apos;s clients say
              </h1>
              {(profile.averageRating !== null || total > 0) && (
                <div className="mt-1 flex items-center gap-2">
                  {profile.averageRating !== null && (
                    <>
                      <div className="flex gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <StarIcon
                            key={i}
                            className="h-4 w-4 fill-foreground text-foreground"
                          />
                        ))}
                      </div>
                      <span className="text-sm font-medium">
                        {profile.averageRating.toFixed(1)}
                      </span>
                    </>
                  )}
                  <span className="text-sm text-muted-foreground">
                    · {total} {total === 1 ? "Review" : "Reviews"}
                  </span>
                </div>
              )}
            </div>
          </header>

          {reviews.length > 0 ? (
            <div className="space-y-4">
              {reviews.map((review) => (
                <article
                  key={review.id}
                  className="rounded-xl bg-background p-6"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
                      {review.author.firstName.charAt(0)}
                    </div>
                    <span className="text-sm font-medium">
                      {review.author.firstName} {review.author.lastNameInitial}.
                    </span>
                    <span className="text-xs text-muted-foreground">
                      · Verified client
                    </span>
                  </div>
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex gap-0.5">
                      {Array.from({ length: review.rating }).map((_, j) => (
                        <StarIcon
                          key={j}
                          className="h-3 w-3 fill-foreground text-foreground"
                        />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {review.createdAt.toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground">
                    {review.reviewText}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {firstName} doesn&apos;t have any public reviews yet.
            </p>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
