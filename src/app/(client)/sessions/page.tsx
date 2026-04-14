import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionsByClient } from "@/lib/sessions/queries";
import { SessionCard } from "@/components/session/session-card";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!user) redirect("/sign-in");

  const sessions = await getSessionsByClient(user.id);

  const active = sessions.filter((s) =>
    ["BOOKED", "ACTIVE", "PENDING_END", "PENDING_END_APPROVAL", "END_DECLINED"].includes(s.status)
  );
  const completed = sessions.filter((s) =>
    ["COMPLETED", "CANCELLED", "FROZEN", "REASSIGNED"].includes(s.status)
  );

  return (
    <main className="min-h-screen bg-[#FAF8F5]">
      <div className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="mb-8 font-serif text-3xl font-light text-stone-900">
          My Sessions
        </h1>

        {sessions.length === 0 && (
          <div className="rounded-2xl border border-stone-200 bg-white p-12 text-center">
            <p className="text-stone-500">No sessions yet.</p>
            <Link
              href="/stylists"
              className="mt-4 inline-block rounded-full bg-black px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Find a Stylist
            </Link>
          </div>
        )}

        {active.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-stone-400">
              Active
            </h2>
            <div className="space-y-4">
              {active.map((s) => (
                <SessionCard key={s.id} session={s} />
              ))}
            </div>
          </section>
        )}

        {completed.length > 0 && (
          <section>
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-stone-400">
              Past
            </h2>
            <div className="space-y-4">
              {completed.map((s) => (
                <SessionCard key={s.id} session={s} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
