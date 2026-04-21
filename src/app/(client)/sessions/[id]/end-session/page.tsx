import { prisma } from "@/lib/prisma";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { EndSessionForm } from "./end-session-form";

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

  // Already submitted — show the confirmation + skip the form.
  if (session.rating != null) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="mb-4 text-3xl font-semibold">Thanks for the feedback</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          We&apos;ve recorded your rating for{" "}
          {session.stylist?.firstName ?? "your stylist"}.
        </p>
        <Link
          href="/sessions"
          className="rounded-full bg-foreground px-6 py-2 text-sm text-background"
        >
          Back to Sessions
        </Link>
      </div>
    );
  }

  const plan = await prisma.plan.findUnique({
    where: { type: session.planType },
    select: { priceInCents: true },
  });
  if (!plan) notFound();

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <h1 className="mb-2 text-3xl font-semibold">Wrap up your session</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        A quick rating for {session.stylist?.firstName ?? "your stylist"} + an
        optional tip. You can add a note too — reviews help other clients find
        the right stylist.
      </p>
      <EndSessionForm
        sessionId={session.id}
        stylistFirstName={session.stylist?.firstName ?? "your stylist"}
        planPriceCents={plan.priceInCents}
      />
    </div>
  );
}
