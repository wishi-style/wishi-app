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
      <div className="min-h-screen bg-background">
        {/* Hero — Loveable Reviews.tsx:55-63 */}
        <section className="container max-w-5xl py-16 md:py-24">
          <div className="text-center mb-14">
            <h1 className="font-display text-4xl md:text-5xl mb-3">
              Our Clients Tell It How It Is
            </h1>
            <p className="font-body text-base text-muted-foreground max-w-lg mx-auto">
              Real stories from real people who transformed their style with
              Wishi.
            </p>
          </div>

          {reviews.length > 0 ? (
            <div className="columns-1 md:columns-3 gap-8 space-y-8">
              {reviews.map((review) => (
                <div key={review.id} className="break-inside-avoid">
                  <div className="flex flex-col h-full border border-border rounded-xl overflow-hidden">
                    <div className="p-6 flex flex-col flex-1">
                      <div className="flex gap-1 mb-4">
                        {Array.from({ length: review.rating }).map((_, i) => (
                          <StarIcon
                            key={i}
                            className="h-4 w-4 fill-foreground text-foreground"
                          />
                        ))}
                      </div>
                      <p className="font-body text-base text-foreground leading-relaxed flex-1 italic">
                        &ldquo;{review.reviewText}&rdquo;
                      </p>
                      <div className="mt-4 pt-4 border-t border-border flex items-center gap-3">
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
                            <div className="flex h-full w-full items-center justify-center font-body text-xs text-muted-foreground">
                              {review.stylist.firstName.charAt(0)}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-display text-base">
                            {review.author.firstName}{" "}
                            {review.author.lastNameInitial}.
                          </p>
                          <Link
                            href={`/stylists/${review.stylist.profileId}`}
                            className="font-body text-xs text-muted-foreground underline-offset-4 hover:underline"
                          >
                            Styled by {review.stylist.firstName}
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="font-body text-center text-sm text-muted-foreground">
              Reviews are just around the corner — our first cohort is finishing
              their sessions now.
            </p>
          )}
        </section>
      </div>
      <SiteFooter />
    </>
  );
}
