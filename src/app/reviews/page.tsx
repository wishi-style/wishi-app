import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { StarIcon } from "lucide-react";
import { SiteHeader } from "@/components/primitives/site-header";
import { SiteFooter } from "@/components/primitives/site-footer";
import { listFeaturedReviews } from "@/lib/stylists/review.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reviews — Wishi",
  description:
    "Real stories from real people who transformed their style with Wishi.",
  alternates: { canonical: "/reviews" },
};

export default async function ReviewsPage() {
  const reviews = await listFeaturedReviews({ limit: 12 });

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background">
        <section className="container mx-auto max-w-5xl px-6 py-16 md:py-24">
          <div className="mb-14 text-center">
            <h1 className="mb-3 font-display text-4xl md:text-5xl">
              Our clients tell it how it is
            </h1>
            <p className="mx-auto max-w-lg text-base text-muted-foreground">
              Real stories from real people who transformed their style with
              Wishi.
            </p>
          </div>

          {reviews.length > 0 ? (
            <div className="gap-8 space-y-8 md:columns-2 lg:columns-3">
              {reviews.map((review) => (
                <article
                  key={review.id}
                  className="break-inside-avoid overflow-hidden rounded-xl border border-border bg-card"
                >
                  <div className="flex flex-col p-6">
                    <div className="mb-4 flex gap-1">
                      {Array.from({ length: review.rating }).map((_, i) => (
                        <StarIcon
                          key={i}
                          className="h-4 w-4 fill-foreground text-foreground"
                        />
                      ))}
                    </div>
                    <p className="flex-1 text-base italic leading-relaxed text-foreground">
                      “{review.reviewText}”
                    </p>
                    <div className="mt-5 flex items-center gap-3 border-t border-border pt-4">
                      <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-muted">
                        {review.stylist.avatarUrl ? (
                          <Image
                            src={review.stylist.avatarUrl}
                            alt={review.stylist.firstName}
                            fill
                            sizes="36px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                            {review.stylist.firstName.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-display text-sm">
                          {review.author.firstName}{" "}
                          {review.author.lastNameInitial}.
                        </p>
                        <Link
                          href={`/stylists/${review.stylist.profileId}`}
                          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                        >
                          Styled by {review.stylist.firstName}
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Reviews are just around the corner — our first cohort is finishing
              their sessions now.
            </p>
          )}

          <div className="mt-14 text-center">
            <Link
              href="/stylists"
              className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
            >
              Meet our stylists
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
