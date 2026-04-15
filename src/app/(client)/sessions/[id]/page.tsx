import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { getSessionById } from "@/lib/sessions/queries";
import Link from "next/link";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

const statusLabels: Record<string, string> = {
  BOOKED: "Booked",
  ACTIVE: "Active",
  PENDING_END: "Wrapping Up",
  PENDING_END_APPROVAL: "Awaiting Approval",
  END_DECLINED: "Continuing",
  COMPLETED: "Completed",
  FROZEN: "Frozen",
  REASSIGNED: "Reassigned",
  CANCELLED: "Cancelled",
};

const statusColors: Record<string, string> = {
  BOOKED: "bg-amber-100 text-amber-700",
  ACTIVE: "bg-emerald-100 text-emerald-700",
  PENDING_END: "bg-blue-100 text-blue-700",
  PENDING_END_APPROVAL: "bg-blue-100 text-blue-700",
  END_DECLINED: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-stone-100 text-stone-600",
  FROZEN: "bg-red-100 text-red-700",
  REASSIGNED: "bg-stone-100 text-stone-600",
  CANCELLED: "bg-stone-100 text-stone-500",
};

export default async function SessionDetailPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentAuthUser();
  if (!user) redirect("/sign-in");

  const session = await getSessionById(id);
  if (!session || session.clientId !== user.id) notFound();

  // Check if style quiz needs to be completed
  const hasStyleProfile = await prisma.styleProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  const stylistName = session.stylist
    ? `${session.stylist.firstName} ${session.stylist.lastName}`
    : null;

  return (
    <main className="min-h-screen bg-[#FAF8F5]">
      <div className="mx-auto max-w-3xl px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/sessions"
            className="mb-4 inline-block text-sm text-stone-400 hover:text-stone-600"
          >
            &larr; All Sessions
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-3xl font-light text-stone-900">
              {session.planType} Session
            </h1>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${statusColors[session.status] ?? "bg-stone-100 text-stone-600"}`}
            >
              {statusLabels[session.status] ?? session.status}
            </span>
          </div>
        </div>

        {/* Stylist Info */}
        <div className="mb-8 rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-stone-400">
            Your Stylist
          </h2>
          {stylistName ? (
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 overflow-hidden rounded-full bg-stone-200">
                {session.stylist?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={session.stylist.avatarUrl}
                    alt={stylistName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-lg text-stone-400">
                    {stylistName.charAt(0)}
                  </div>
                )}
              </div>
              <span className="font-medium text-stone-800">{stylistName}</span>
            </div>
          ) : (
            <p className="text-sm text-stone-500">
              We&apos;re finding the perfect stylist for you...
            </p>
          )}
        </div>

        {/* Session Details */}
        <div className="mb-8 rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-stone-400">
            Details
          </h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-stone-400">Plan</dt>
              <dd className="font-medium text-stone-800">{session.planType}</dd>
            </div>
            <div>
              <dt className="text-stone-400">Amount</dt>
              <dd className="font-medium text-stone-800">
                ${(session.amountPaidInCents / 100).toFixed(0)}
              </dd>
            </div>
            <div>
              <dt className="text-stone-400">Moodboards</dt>
              <dd className="font-medium text-stone-800">
                {session.moodboardsSent} / {session.moodboardsAllowed}
              </dd>
            </div>
            <div>
              <dt className="text-stone-400">Styleboards</dt>
              <dd className="font-medium text-stone-800">
                {session.styleboardsSent} / {session.styleboardsAllowed}
              </dd>
            </div>
          </dl>
        </div>

        {/* CTAs */}
        <div className="flex flex-wrap gap-3">
          {!hasStyleProfile && (
            <Link
              href={`/sessions/${session.id}/style-quiz`}
              className="rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Complete Style Quiz
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
