import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

const statusColors: Record<string, string> = {
  BOOKED: "bg-blue-100 text-blue-700",
  ACTIVE: "bg-green-100 text-green-700",
  PENDING_END: "bg-amber-100 text-amber-700",
  PENDING_END_APPROVAL: "bg-amber-100 text-amber-700",
  END_DECLINED: "bg-red-100 text-red-700",
  COMPLETED: "bg-stone-100 text-stone-500",
};

export default async function StylistSessionsPage() {
  const user = await getCurrentAuthUser();
  if (!user) redirect("/sign-in");

  const sessions = await prisma.session.findMany({
    where: { stylistId: user.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      planType: true,
      twilioChannelSid: true,
      createdAt: true,
      client: {
        select: { firstName: true, lastName: true },
      },
    },
  });

  return (
    <main className="min-h-screen bg-[#FAF8F5]">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="mb-8 font-serif text-3xl font-light text-stone-900">
          My Sessions
        </h1>

        {sessions.length === 0 ? (
          <p className="py-12 text-center text-sm text-stone-400">
            No sessions yet. You&apos;ll see your clients here once matched.
          </p>
        ) : (
          <div className="space-y-4">
            {sessions.map((session) => {
              const clientName = `${session.client.firstName} ${session.client.lastName}`;
              const hasChat = !!session.twilioChannelSid;
              const chatStatuses = ["ACTIVE", "PENDING_END", "PENDING_END_APPROVAL", "END_DECLINED"];
              const canChat = hasChat && chatStatuses.includes(session.status);

              return (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white p-5"
                >
                  <div>
                    <p className="text-sm font-medium text-stone-900">
                      {clientName}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-stone-400">
                        {session.planType} Session
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors[session.status] ?? "bg-stone-100 text-stone-500"}`}
                      >
                        {session.status.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>
                  {canChat && (
                    <Link
                      href={`/stylist/sessions/${session.id}/chat`}
                      className="rounded-full bg-black px-5 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
                    >
                      Open Chat
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
