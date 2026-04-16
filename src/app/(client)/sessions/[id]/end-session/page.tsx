import { prisma } from "@/lib/prisma";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";

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
    select: { clientId: true, status: true, stylist: { select: { firstName: true } } },
  });
  if (!session || session.clientId !== user.id) notFound();

  return (
    <div className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="mb-4 text-3xl font-semibold">Session wrapped up</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Your session with {session.stylist?.firstName ?? "your stylist"} is
        complete. The tip, rating, and review flow is coming soon — for now
        you&apos;re all set.
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
