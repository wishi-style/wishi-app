import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { cosmeticMatchScore } from "@/lib/matching/score";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function StylistProfilePage({ params }: Props) {
  const { id } = await params;

  const stylist = await prisma.stylistProfile.findUnique({
    where: { id },
    include: {
      user: {
        select: { firstName: true, lastName: true, avatarUrl: true },
      },
      reviews: {
        include: {
          user: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  if (!stylist) notFound();

  const name = `${stylist.user.firstName} ${stylist.user.lastName}`;

  // Get match score if user has quiz results
  let matchScore: number | null = null;
  const { userId: clerkId } = await auth();
  if (clerkId) {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    if (user) {
      const quizResult = await prisma.matchQuizResult.findFirst({
        where: { userId: user.id },
        orderBy: { completedAt: "desc" },
      });
      if (quizResult) {
        matchScore = cosmeticMatchScore(stylist, quizResult);
      }
    }
  }

  return (
    <main className="min-h-screen bg-[#FAF8F5]">
      <div className="mx-auto max-w-3xl px-4 py-12">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <div className="h-32 w-32 flex-shrink-0 overflow-hidden rounded-full bg-stone-200">
            {stylist.user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={stylist.user.avatarUrl}
                alt={name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-4xl text-stone-400">
                {name.charAt(0)}
              </div>
            )}
          </div>
          <div className="text-center sm:text-left">
            <h1 className="font-serif text-3xl font-light text-stone-900">{name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {matchScore && (
                <span className="rounded-full bg-black px-3 py-1 text-xs font-medium text-white">
                  {matchScore}% Match
                </span>
              )}
              {stylist.yearsExperience && (
                <span className="text-sm text-stone-500">
                  {stylist.yearsExperience}+ years experience
                </span>
              )}
              {stylist.averageRating && (
                <span className="text-sm text-stone-500">
                  ★ {stylist.averageRating.toFixed(1)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Bio & Philosophy */}
        {stylist.bio && (
          <div className="mb-6">
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-stone-400">
              About
            </h2>
            <p className="text-sm leading-relaxed text-stone-700">{stylist.bio}</p>
          </div>
        )}
        {stylist.philosophy && (
          <div className="mb-6">
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-stone-400">
              Style Philosophy
            </h2>
            <p className="text-sm leading-relaxed text-stone-700">
              {stylist.philosophy}
            </p>
          </div>
        )}
        {stylist.directorPick && (
          <div className="mb-6 rounded-xl bg-stone-100 p-4">
            <h2 className="mb-1 text-xs font-medium uppercase tracking-wider text-stone-400">
              Director&apos;s Pick
            </h2>
            <p className="text-sm italic text-stone-600">{stylist.directorPick}</p>
          </div>
        )}

        {/* Specialties */}
        {stylist.styleSpecialties.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-stone-400">
              Specialties
            </h2>
            <div className="flex flex-wrap gap-2">
              {stylist.styleSpecialties.map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-stone-200 bg-white px-4 py-1.5 text-sm capitalize text-stone-700"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="mb-12 flex gap-4">
          {stylist.isAvailable ? (
            <Link
              href={`/bookings/new?stylistId=${stylist.id}`}
              className="rounded-full bg-black px-8 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Book This Stylist
            </Link>
          ) : (
            <WaitlistButton stylistProfileId={stylist.id} />
          )}
        </div>

        {/* Reviews */}
        {stylist.reviews.length > 0 && (
          <div>
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-stone-400">
              Reviews
            </h2>
            <div className="space-y-4">
              {stylist.reviews.map((review) => (
                <div
                  key={review.id}
                  className="rounded-xl border border-stone-200 bg-white p-4"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-sm font-medium text-stone-800">
                      {review.user.firstName} {review.user.lastName.charAt(0)}.
                    </span>
                    <span className="text-sm text-stone-400">
                      {"★".repeat(review.rating)}
                    </span>
                  </div>
                  <p className="text-sm text-stone-600">{review.reviewText}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function WaitlistButton({ stylistProfileId }: { stylistProfileId: string }) {
  return (
    <form
      action={`/api/stylists/${stylistProfileId}/waitlist`}
      method="POST"
    >
      <button
        type="submit"
        className="rounded-full border border-black bg-white px-8 py-3 text-sm font-medium text-black transition-colors hover:bg-stone-50"
      >
        Join Waitlist
      </button>
    </form>
  );
}
