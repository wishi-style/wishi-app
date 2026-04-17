import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Stylist CRM dashboard. Groups sessions by SessionPendingAction state:
//   overdue     — OPEN pending actions whose dueAt has passed
//   active      — OPEN pending actions still within SLA
//   pending-end — PENDING_END_APPROVAL action OPEN (client needs to approve)
//   completed   — Session.status = COMPLETED within last 30 days

type SessionCardData = {
  sessionId: string;
  clientName: string;
  planType: string;
  status: string;
  boardsDelivered: number;
  boardsAllowed: number;
  overdueActions: string[];
  dueNextAt: Date | null;
};

function formatActionLabel(type: string): string {
  return type
    .replace(/^PENDING_/, "")
    .toLowerCase()
    .replace(/_/g, " ");
}

export default async function StylistDashboard() {
  await requireRole("STYLIST");
  const user = await getCurrentAuthUser();
  if (!user) return null;

  const now = new Date();

  // Pull all of this stylist's non-completed sessions + their open actions
  // in a single query.
  const activeSessions = await prisma.session.findMany({
    where: {
      stylistId: user.id,
      status: { in: ["BOOKED", "ACTIVE", "PENDING_END", "PENDING_END_APPROVAL"] },
    },
    select: {
      id: true,
      planType: true,
      status: true,
      moodboardsSent: true,
      styleboardsSent: true,
      moodboardsAllowed: true,
      styleboardsAllowed: true,
      client: { select: { firstName: true, lastName: true } },
      pendingActions: {
        where: { status: "OPEN" },
        select: { type: true, dueAt: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const overdue: SessionCardData[] = [];
  const activeCards: SessionCardData[] = [];
  const pendingEnd: SessionCardData[] = [];

  for (const s of activeSessions) {
    const openActions = s.pendingActions;
    const overdueActions = openActions.filter((a) => a.dueAt < now).map((a) => formatActionLabel(a.type));
    const dueNextAt =
      openActions.length > 0
        ? openActions.reduce((min, a) => (a.dueAt < min ? a.dueAt : min), openActions[0].dueAt)
        : null;
    const card: SessionCardData = {
      sessionId: s.id,
      clientName: `${s.client?.firstName ?? ""} ${s.client?.lastName ?? ""}`.trim() || "Client",
      planType: s.planType,
      status: s.status,
      boardsDelivered: s.moodboardsSent + s.styleboardsSent,
      boardsAllowed: s.moodboardsAllowed + s.styleboardsAllowed,
      overdueActions,
      dueNextAt,
    };

    if (s.status === "PENDING_END_APPROVAL" || s.status === "PENDING_END") {
      pendingEnd.push(card);
    } else if (overdueActions.length > 0) {
      overdue.push(card);
    } else {
      activeCards.push(card);
    }
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const completed = await prisma.session.findMany({
    where: {
      stylistId: user.id,
      status: "COMPLETED",
      completedAt: { gte: thirtyDaysAgo },
    },
    select: {
      id: true,
      planType: true,
      completedAt: true,
      client: { select: { firstName: true, lastName: true } },
    },
    orderBy: { completedAt: "desc" },
    take: 20,
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="mb-6 text-3xl font-semibold">Your queue</h1>

      <Group title={`Overdue (${overdue.length})`} tone="bad">
        {overdue.length === 0 ? (
          <EmptyLine>All caught up — nothing past due.</EmptyLine>
        ) : (
          overdue.map((c) => <Card key={c.sessionId} card={c} />)
        )}
      </Group>

      <Group title={`Pending end (${pendingEnd.length})`} tone="warn">
        {pendingEnd.length === 0 ? (
          <EmptyLine>No sessions waiting on client approval.</EmptyLine>
        ) : (
          pendingEnd.map((c) => <Card key={c.sessionId} card={c} />)
        )}
      </Group>

      <Group title={`Active (${activeCards.length})`}>
        {activeCards.length === 0 ? (
          <EmptyLine>No active sessions right now.</EmptyLine>
        ) : (
          activeCards.map((c) => <Card key={c.sessionId} card={c} />)
        )}
      </Group>

      <Group title={`Completed (last 30 days, ${completed.length})`}>
        {completed.length === 0 ? (
          <EmptyLine>No completions in the last 30 days.</EmptyLine>
        ) : (
          completed.map((s) => (
            <Link
              key={s.id}
              href={`/stylist/sessions/${s.id}`}
              className="flex items-center justify-between border-b border-muted py-3 text-sm"
            >
              <div>
                {`${s.client?.firstName ?? ""} ${s.client?.lastName ?? ""}`.trim() || "Client"} · {s.planType}
              </div>
              <div className="text-xs text-muted-foreground">
                {s.completedAt?.toLocaleDateString()}
              </div>
            </Link>
          ))
        )}
      </Group>
    </div>
  );
}

function Group({
  title,
  tone = "default",
  children,
}: {
  title: string;
  tone?: "bad" | "warn" | "default";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "bad" ? "text-red-700" : tone === "warn" ? "text-amber-700" : "text-foreground";
  return (
    <section className="mb-8">
      <h2 className={`mb-3 text-sm font-medium uppercase tracking-wide ${toneClass}`}>{title}</h2>
      <div className="divide-y divide-muted rounded-lg border border-muted">{children}</div>
    </section>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <div className="p-4 text-sm text-muted-foreground">{children}</div>;
}

function Card({ card }: { card: SessionCardData }) {
  const progress = card.boardsAllowed === 0 ? 0 : Math.round((card.boardsDelivered / card.boardsAllowed) * 100);
  return (
    <Link
      href={`/stylist/sessions/${card.sessionId}`}
      className="block p-4 transition-colors hover:bg-muted/30"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">{card.clientName}</div>
          <div className="text-xs text-muted-foreground">
            {card.planType} · {card.boardsDelivered}/{card.boardsAllowed} boards
            {card.overdueActions.length > 0 && (
              <span className="ml-2 text-red-700">
                · overdue: {card.overdueActions.join(", ")}
              </span>
            )}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {card.dueNextAt && `Due ${card.dueNextAt.toLocaleDateString()}`}
          <div className="mt-1 h-1 w-20 overflow-hidden rounded bg-muted">
            <div className="h-full bg-foreground" style={{ width: `${Math.min(progress, 100)}%` }} />
          </div>
        </div>
      </div>
    </Link>
  );
}
