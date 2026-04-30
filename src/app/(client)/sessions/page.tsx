import { redirect } from "next/navigation";
import Image from "next/image";
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

  const total = sessions.length;

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-12">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <h1 className="font-display text-4xl md:text-5xl tracking-tight">
              My Style Sessions
            </h1>
            <p className="mt-3 text-sm font-body text-muted-foreground">
              {total} session{total !== 1 && "s"}
            </p>
          </div>
        </div>

        {active.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-4 font-display text-lg text-dark-taupe">
              Active
            </h2>
            <div className="space-y-4">
              {active.map((s: (typeof sessions)[number]) => (
                <SessionCard key={s.id} session={s} />
              ))}
            </div>
          </section>
        )}

        <div className="mb-12 flex flex-col items-start justify-between gap-4 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:p-6">
          <div className="flex min-w-0 items-center gap-4">
            <div className="h-12 w-16 shrink-0 overflow-hidden rounded-md">
              <Image
                src="/img/gift-card-icon.png"
                alt=""
                width={978}
                height={592}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-lg">Give the gift of style</h3>
            </div>
          </div>
          <PillButton
            href="https://wishi.me/gift-cards/choose"
            variant="outline"
            size="sm"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full shrink-0 rounded-sm px-6 text-xs sm:w-auto"
          >
            Buy gift card
          </PillButton>
        </div>

        {completed.length > 0 && (
          <section>
            <h2 className="mb-4 font-display text-lg text-taupe">
              Previous Sessions
            </h2>
            <div className="space-y-3">
              {completed.map((s: (typeof sessions)[number]) => (
                <SessionCard key={s.id} session={s} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
