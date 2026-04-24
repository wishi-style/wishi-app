import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import Link from "next/link";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const statusStyles: Record<string, string> = {
  BOOKED: "bg-blue-50 text-blue-700 border-blue-200",
  ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PENDING_END: "bg-amber-50 text-amber-700 border-amber-200",
  PENDING_END_APPROVAL: "bg-amber-50 text-amber-700 border-amber-200",
  END_DECLINED: "bg-rose-50 text-rose-700 border-rose-200",
  COMPLETED: "bg-stone-50 text-stone-500 border-stone-200",
  CANCELLED: "bg-stone-50 text-stone-500 border-stone-200",
};

const CHAT_STATUSES = new Set([
  "ACTIVE",
  "PENDING_END",
  "PENDING_END_APPROVAL",
  "END_DECLINED",
]);

export default async function StylistSessionsPage() {
  const user = await getCurrentAuthUser();
  if (!user) redirect("/sign-in");

  const sessions = await prisma.session.findMany({
    where: { stylistId: user.id, deletedAt: null },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      status: true,
      planType: true,
      twilioChannelSid: true,
      createdAt: true,
      updatedAt: true,
      client: {
        select: { firstName: true, lastName: true, avatarUrl: true },
      },
    },
  });

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl">My Sessions</h1>
            <p className="font-body text-sm text-muted-foreground mt-1">
              {sessions.length} total
            </p>
          </div>
          <Link
            href="/stylist/dashboard"
            className="rounded-full border border-border px-4 py-1.5 font-body text-xs hover:bg-foreground hover:text-background transition-colors"
          >
            Open dashboard
          </Link>
        </div>

        {sessions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-12 text-center font-body text-sm text-muted-foreground">
            No sessions yet. You&apos;ll see your clients here once matched.
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => {
              const clientName =
                [s.client.firstName, s.client.lastName]
                  .filter(Boolean)
                  .join(" ") || "Client";
              const initials =
                `${s.client.firstName?.[0] ?? ""}${s.client.lastName?.[0] ?? ""}`
                  .toUpperCase() || "?";
              const canOpen =
                !!s.twilioChannelSid && CHAT_STATUSES.has(s.status);
              const planLabel =
                s.planType === "LUX"
                  ? "✦ Lux"
                  : s.planType === "MAJOR"
                    ? "Major"
                    : "Mini";
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-10 w-10">
                      {s.client.avatarUrl ? (
                        <AvatarImage
                          src={s.client.avatarUrl}
                          alt={clientName}
                        />
                      ) : null}
                      <AvatarFallback className="bg-secondary text-secondary-foreground font-display text-xs">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-display text-sm truncate">
                          {clientName}
                        </p>
                        <Badge
                          variant="outline"
                          className="rounded-sm text-[10px] font-body font-medium border-0 bg-secondary text-secondary-foreground"
                        >
                          {planLabel}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={cn(
                            "rounded-sm border px-1.5 py-0.5 font-body text-[10px] font-medium",
                            statusStyles[s.status] ??
                              "border-border bg-muted text-muted-foreground",
                          )}
                        >
                          {s.status.replace(/_/g, " ")}
                        </span>
                        <span className="font-body text-[11px] text-muted-foreground">
                          {s.updatedAt.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                  {canOpen ? (
                    <Link
                      href={`/stylist/sessions/${s.id}/workspace`}
                      className="rounded-full bg-foreground text-background px-4 py-1.5 font-body text-xs hover:opacity-90 transition-opacity"
                    >
                      Open
                    </Link>
                  ) : (
                    <span className="font-body text-xs text-muted-foreground">
                      —
                    </span>
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
