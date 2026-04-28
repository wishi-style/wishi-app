import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/prisma";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const OPEN_STATUSES = ["ACTIVE", "PENDING_END", "PENDING_END_APPROVAL"] as const;

function formatRelative(d: Date): string {
  const ms = Date.now() - d.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} wk ago`;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default async function StylistClientsPage() {
  await requireRole("STYLIST");
  const user = await getCurrentAuthUser();
  if (!user) return null;

  const [counts, latestSessions, latestOpenSessions] = await Promise.all([
    prisma.session.groupBy({
      by: ["clientId"],
      where: { stylistId: user.id },
      _count: { _all: true },
    }),
    prisma.session.findMany({
      where: { stylistId: user.id },
      distinct: ["clientId"],
      orderBy: [{ clientId: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        clientId: true,
        createdAt: true,
        completedAt: true,
        planType: true,
        client: { select: { firstName: true, lastName: true, avatarUrl: true } },
      },
    }),
    prisma.session.findMany({
      where: { stylistId: user.id, status: { in: [...OPEN_STATUSES] } },
      distinct: ["clientId"],
      orderBy: [{ clientId: "asc" }, { createdAt: "desc" }],
      select: { id: true, clientId: true },
    }),
  ]);

  const countByClient = new Map(counts.map((c) => [c.clientId, c._count._all]));
  const openByClient = new Map(latestOpenSessions.map((s) => [s.clientId, s.id]));

  const clients = latestSessions
    .map((s) => ({
      clientId: s.clientId,
      firstName: s.client?.firstName ?? "",
      lastName: s.client?.lastName ?? "",
      avatarUrl: s.client?.avatarUrl ?? null,
      sessionCount: countByClient.get(s.clientId) ?? 1,
      lastActivityAt: s.completedAt ?? s.createdAt,
      openSessionId: openByClient.get(s.clientId) ?? null,
      latestPlan: s.planType as "MINI" | "MAJOR" | "LUX",
    }))
    .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <h1 className="font-display text-3xl">Your clients</h1>
        <p className="font-body text-sm text-muted-foreground mt-1">
          {clients.length} {clients.length === 1 ? "person" : "people"} styled
        </p>
      </div>

      {clients.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center font-body text-sm text-muted-foreground">
          No clients yet. The matcher will send new sessions to you as they come in.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {clients.map((c) => {
            const initials =
              `${c.firstName[0] ?? ""}${c.lastName[0] ?? ""}`.toUpperCase() || "?";
            const planLabel =
              c.latestPlan === "LUX"
                ? "✦ Lux"
                : c.latestPlan === "MAJOR"
                  ? "Major"
                  : "Mini";
            return (
              <Link
                key={c.clientId}
                href={`/stylist/clients/${c.clientId}`}
                className="rounded-lg border border-border bg-card p-4 hover:shadow-sm transition-shadow flex items-center gap-4"
              >
                <Avatar className="h-12 w-12">
                  {c.avatarUrl ? (
                    <AvatarImage src={c.avatarUrl} alt={c.firstName} />
                  ) : null}
                  <AvatarFallback className="bg-secondary text-secondary-foreground font-display">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-base truncate">
                      {c.firstName} {c.lastName}
                    </h3>
                    <Badge
                      variant="outline"
                      className="rounded-sm text-[10px] font-body font-medium border-0 bg-secondary text-secondary-foreground"
                    >
                      {planLabel}
                    </Badge>
                  </div>
                  <p className="font-body text-xs text-muted-foreground mt-0.5">
                    {c.sessionCount} session{c.sessionCount === 1 ? "" : "s"} ·
                    {" "}
                    {formatRelative(c.lastActivityAt)}
                  </p>
                </div>
                {c.openSessionId && (
                  <span className="shrink-0 rounded-full bg-foreground/5 border border-foreground/20 px-2.5 py-1 font-body text-[10px] font-medium text-foreground">
                    Active
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
