import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Lists every client a stylist has worked with. Pulled from distinct
// Session.clientId where stylistId = me (any status). Shows session count
// + last-session-at, links to /stylist/clients/[id].

export default async function StylistClientsPage() {
  await requireRole("STYLIST");
  const user = await getCurrentAuthUser();
  if (!user) return null;

  const sessions = await prisma.session.findMany({
    where: { stylistId: user.id },
    select: {
      id: true,
      clientId: true,
      status: true,
      createdAt: true,
      completedAt: true,
      planType: true,
      client: { select: { firstName: true, lastName: true, avatarUrl: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Reduce to one row per client with aggregates.
  const byClient = new Map<
    string,
    {
      clientId: string;
      firstName: string;
      lastName: string;
      avatarUrl: string | null;
      sessionCount: number;
      lastActivityAt: Date;
      openSessionId: string | null;
      latestPlan: string;
    }
  >();
  for (const s of sessions) {
    const existing = byClient.get(s.clientId);
    const activity = s.completedAt ?? s.createdAt;
    if (!existing) {
      byClient.set(s.clientId, {
        clientId: s.clientId,
        firstName: s.client?.firstName ?? "",
        lastName: s.client?.lastName ?? "",
        avatarUrl: s.client?.avatarUrl ?? null,
        sessionCount: 1,
        lastActivityAt: activity,
        openSessionId:
          s.status === "ACTIVE" || s.status === "PENDING_END" || s.status === "PENDING_END_APPROVAL"
            ? s.id
            : null,
        latestPlan: s.planType,
      });
    } else {
      existing.sessionCount += 1;
      if (activity > existing.lastActivityAt) existing.lastActivityAt = activity;
      if (
        !existing.openSessionId &&
        (s.status === "ACTIVE" || s.status === "PENDING_END" || s.status === "PENDING_END_APPROVAL")
      ) {
        existing.openSessionId = s.id;
      }
    }
  }

  const clients = Array.from(byClient.values()).sort(
    (a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime()
  );

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-6 text-3xl font-semibold">Your clients</h1>

      {clients.length === 0 ? (
        <div className="rounded border border-dashed border-muted p-8 text-center text-sm text-muted-foreground">
          No clients yet. The matcher will send new sessions to you when
          available.
        </div>
      ) : (
        <div className="divide-y divide-muted rounded-lg border border-muted">
          {clients.map((c) => (
            <Link
              key={c.clientId}
              href={`/stylist/clients/${c.clientId}`}
              className="flex items-center justify-between p-4 hover:bg-muted/30"
            >
              <div className="flex items-center gap-3">
                {c.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.avatarUrl}
                    alt={c.firstName}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-medium">
                    {(c.firstName[0] ?? "?").toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="font-medium">
                    {c.firstName} {c.lastName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.sessionCount} session{c.sessionCount === 1 ? "" : "s"} · latest: {c.latestPlan}
                  </div>
                </div>
              </div>
              {c.openSessionId && (
                <span className="rounded-full border border-foreground px-3 py-1 text-xs">
                  Active session
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
