import { redirect } from "next/navigation";
import { getSessionsByClient } from "@/lib/sessions/queries";
import { SessionCard } from "@/components/session/session-card";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { PillButton } from "@/components/primitives/pill-button";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const user = await getCurrentAuthUser();
  if (!user) redirect("/sign-in");

  const sessions = await getSessionsByClient(user.id);

  const active = sessions.filter((s: (typeof sessions)[number]) =>
    ["BOOKED", "ACTIVE", "PENDING_END", "PENDING_END_APPROVAL", "END_DECLINED"].includes(
      s.status,
    ),
  );
  const completed = sessions.filter((s: (typeof sessions)[number]) =>
    ["COMPLETED", "CANCELLED", "FROZEN", "REASSIGNED"].includes(s.status),
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 md:px-10 py-12 md:py-16">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl md:text-4xl">My Sessions</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {active.length > 0
                ? `${active.length} active · ${completed.length} past`
                : "Start a new session any time."}
            </p>
          </div>
          <PillButton href="/stylists" variant="outline" size="md">
            Find a stylist
          </PillButton>
        </div>

        {sessions.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-12 text-center">
            <p className="text-sm text-muted-foreground">
              You don&apos;t have any sessions yet.
            </p>
            <PillButton
              href="/stylists"
              variant="solid"
              size="md"
              className="mt-5"
            >
              Find a stylist
            </PillButton>
          </div>
        )}

        {active.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Active
            </h2>
            <div className="space-y-4">
              {active.map((s: (typeof sessions)[number]) => (
                <SessionCard key={s.id} session={s} />
              ))}
            </div>
          </section>
        )}

        {completed.length > 0 && (
          <section>
            <h2 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Past
            </h2>
            <div className="space-y-4">
              {completed.map((s: (typeof sessions)[number]) => (
                <SessionCard key={s.id} session={s} />
              ))}
            </div>
          </section>
        )}

        {/* Gift card cross-sell per Loveable */}
        <aside className="mt-12 rounded-2xl bg-cream p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-dark-taupe mb-1">
                Give the gift of style
              </p>
              <h3 className="font-display text-xl md:text-2xl">
                Wishi gift cards — the outfit-planner anyone will actually use.
              </h3>
            </div>
            <PillButton
              href="https://wishi.me/gift-cards"
              variant="solid"
              size="md"
            >
              Shop gift cards
            </PillButton>
          </div>
        </aside>
      </div>
    </div>
  );
}
