import { prisma } from "@/lib/prisma";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { EndSessionPageClient } from "./end-session-page-client";

export const dynamic = "force-dynamic";

export default async function EndSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentAuthUser();
  if (!user) redirect("/sign-in");

  const session = await prisma.session.findUnique({
    where: { id },
    select: {
      id: true,
      clientId: true,
      status: true,
      planType: true,
      rating: true,
      stylist: { select: { firstName: true } },
    },
  });
  if (!session || session.clientId !== user.id) notFound();

  if (session.rating != null) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-lg px-6 md:px-10 py-16 text-center">
          <h1 className="mb-4 font-display text-3xl md:text-4xl">
            Thanks for the feedback
          </h1>
          <p className="mb-8 text-sm text-muted-foreground">
            We&apos;ve recorded your rating for{" "}
            {session.stylist?.firstName ?? "your stylist"}.
          </p>
          <Link
            href="/sessions"
            className="inline-flex h-11 items-center rounded-full bg-foreground px-6 text-sm font-medium text-background hover:bg-foreground/90 transition-colors"
          >
            Back to sessions
          </Link>
        </div>
      </div>
    );
  }

  const plan = await prisma.plan.findUnique({
    where: { type: session.planType },
    select: { priceInCents: true },
  });
  if (!plan) notFound();

  return (
    <EndSessionPageClient
      sessionId={session.id}
      stylistFirstName={session.stylist?.firstName ?? "your stylist"}
      planPriceCents={plan.priceInCents}
      referralCode={user.referralCode}
    />
  );
}
