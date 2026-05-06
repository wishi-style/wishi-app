import { prisma } from "@/lib/prisma";
import { clientDisplayName, clientInitials } from "@/lib/users/display-name";
import type {
  LoyaltyTier as DbLoyaltyTier,
  PendingActionType,
  PlanType,
  SessionStatus,
} from "@/generated/prisma/client";

export type DashboardSessionType = "mini" | "major" | "lux";
export type DashboardSessionPriority =
  | "overdue"
  | "due_today"
  | "active"
  | "new"
  | "completed";
export type DashboardLoyaltyTier = "new" | "bronze" | "silver" | "gold" | "vip";

/**
 * What clicking the dashboard's primary CTA should do for a given session.
 *
 * - "navigate" → `actionHref` is a relative path the card/chat-header pushes onto
 *   the router. Covers Create Moodboard / Create Look / Review Restyle / Open
 *   Chat / View Summary.
 * - "approve-end" → fire the existing `approveEndSession` handler. The
 *   `actionHref` still points at `/stylist/dashboard?session=<id>` so screen
 *   readers + middle-click open the right place.
 *
 * Replaces the previous Loveable-mirrored vocabulary where every label except
 * Create Moodboard / Create Look was a no-op selector — that surfaced as
 * dead "Start styling" / "View session" / "Awaiting approval" buttons in
 * production once real PendingAction states started flowing in.
 */
export type DashboardActionKind = "navigate" | "approve-end";

export interface DashboardSession {
  id: string;
  clientId: string;
  clientName: string;
  clientInitials: string;
  sessionType: DashboardSessionType;
  priority: DashboardSessionPriority;
  dueLabel: string;
  lastMessage: string;
  lastMessageDate: string;
  boardsDelivered: number;
  boardsTotal: number;
  status: string;
  actionLabel: string;
  actionHref: string;
  actionKind: DashboardActionKind;
  loyaltyTier: DashboardLoyaltyTier;
  totalSessions: number;
  // ISO timestamps powering the Active bookings vs Archive split. The
  // dashboard auto-archives a session 24h after `endedAt`; `endRequestedAt`
  // surfaces the pending-end state in the sessions list.
  endedAt: string | null;
  endRequestedAt: string | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function planTypeToSessionType(plan: PlanType): DashboardSessionType {
  if (plan === "MINI") return "mini";
  if (plan === "MAJOR") return "major";
  return "lux";
}

function mapLoyaltyTier(
  tier: DbLoyaltyTier | null | undefined,
  totalSessions: number,
): DashboardLoyaltyTier {
  if (totalSessions === 0) return "new";
  switch (tier) {
    case "PLATINUM":
      return "vip";
    case "GOLD":
      return "gold";
    case "BRONZE":
      return totalSessions >= 2 ? "silver" : "bronze";
    default:
      return "new";
  }
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function humanDueLabel(earliestDueAt: Date | null, now: Date): string {
  if (!earliestDueAt) return "";
  if (isSameLocalDay(earliestDueAt, now)) return "Due Today";
  // Sign-aware day math so something overdue by 3 hours doesn't round to
  // "Due now" (Math.round would truncate it to 0 days).
  const deltaMs = earliestDueAt.getTime() - now.getTime();
  if (deltaMs > 0) {
    const daysAhead = Math.ceil(deltaMs / MS_PER_DAY);
    return daysAhead === 1 ? "Due tomorrow" : `Due in ${daysAhead} days`;
  }
  const daysBehind = Math.ceil(-deltaMs / MS_PER_DAY);
  return `Due: ${daysBehind} day${daysBehind === 1 ? "" : "s"} ago`;
}

export interface DashboardActionContext {
  sessionId: string;
  status: SessionStatus;
  moodboardsSent: number;
  styleboardsSent: number;
  styleboardsAllowed: number;
  endRequestedAt: Date | null;
  pendingActionType: PendingActionType | null;
  /** SessionPendingAction.boardId for PENDING_RESTYLE — the original board the
   *  client wants revised. Pre-fills `?parentBoardId=` so the styleboards
   *  builder opens with the correct revision context. */
  pendingRestyleParentBoardId: string | null;
}

export interface DashboardAction {
  label: string;
  href: string;
  kind: DashboardActionKind;
}

/**
 * Derive the dashboard's primary CTA for one session. Six possible labels,
 * each routing to a real destination — no more no-op buttons. Order matters:
 * terminal/blocking states win over progress states so the stylist always
 * sees the action that actually unblocks the session.
 *
 *   1. Completed / cancelled               → View Summary  (chat read-only)
 *   2. End requested by client             → Approve End   (fires existing UI)
 *   3. No moodboard sent yet               → Create Moodboard
 *   4. Restyle requested on a sent board   → Review Restyle (?parentBoardId=)
 *   5. Looks remain in plan quota          → Create Look
 *   6. Otherwise (quota met, awaiting…)    → Open Chat
 */
export function deriveDashboardAction(ctx: DashboardActionContext): DashboardAction {
  const dashboardChat = `/stylist/dashboard?session=${ctx.sessionId}`;

  if (ctx.status === "COMPLETED" || ctx.status === "CANCELLED") {
    return { label: "View Summary", href: dashboardChat, kind: "navigate" };
  }

  if (ctx.endRequestedAt) {
    return { label: "Approve End", href: dashboardChat, kind: "approve-end" };
  }

  if (ctx.moodboardsSent === 0) {
    return {
      label: "Create Moodboard",
      href: `/stylist/sessions/${ctx.sessionId}/moodboards/new`,
      kind: "navigate",
    };
  }

  if (
    ctx.pendingActionType === "PENDING_RESTYLE" &&
    ctx.pendingRestyleParentBoardId
  ) {
    return {
      label: "Review Restyle",
      href: `/stylist/sessions/${ctx.sessionId}/styleboards/new?parentBoardId=${ctx.pendingRestyleParentBoardId}`,
      kind: "navigate",
    };
  }

  if (ctx.styleboardsSent < ctx.styleboardsAllowed) {
    return {
      label: "Create Look",
      href: `/stylist/sessions/${ctx.sessionId}/styleboards/new`,
      kind: "navigate",
    };
  }

  return { label: "Open Chat", href: dashboardChat, kind: "navigate" };
}

function statusBlurbFor(
  actionType: PendingActionType | null,
  sessionStatus: string,
): string {
  if (sessionStatus === "COMPLETED") return "Session completed";
  if (sessionStatus === "CANCELLED") return "Session cancelled";
  if (sessionStatus === "PENDING_END" || sessionStatus === "PENDING_END_APPROVAL") {
    return "Awaiting end-session approval";
  }
  switch (actionType) {
    case "PENDING_MOODBOARD":
      return "Needs moodboard";
    case "PENDING_STYLEBOARD":
      return "Needs styleboard";
    case "PENDING_RESTYLE":
      return "Restyle requested";
    case "PENDING_CLIENT_FEEDBACK":
      return "Awaiting client feedback";
    case "PENDING_STYLIST_RESPONSE":
      return "Awaiting your reply";
    case "PENDING_FOLLOWUP":
      return "Needs follow-up";
    default:
      return sessionStatus === "BOOKED" ? "New booking" : "In progress";
  }
}

function shortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Fetch the Dashboard queue for a given stylist.
 *
 * Returns sessions shaped to the Loveable StylistDashboard's `DashboardSession`
 * view-model. Includes active + recently-completed sessions; filters the
 * COMPLETED bucket to the last 30 days so the queue doesn't grow unbounded.
 */
export async function getStylistDashboardData(
  stylistUserId: string,
): Promise<DashboardSession[]> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * MS_PER_DAY);

  const sessions = await prisma.session.findMany({
    where: {
      stylistId: stylistUserId,
      deletedAt: null,
      OR: [
        {
          status: {
            in: [
              "BOOKED",
              "ACTIVE",
              "PENDING_END",
              "PENDING_END_APPROVAL",
              "END_DECLINED",
            ],
          },
        },
        { status: "COMPLETED", completedAt: { gte: thirtyDaysAgo } },
      ],
    },
    select: {
      id: true,
      status: true,
      planType: true,
      clientId: true,
      moodboardsSent: true,
      styleboardsSent: true,
      moodboardsAllowed: true,
      styleboardsAllowed: true,
      startedAt: true,
      completedAt: true,
      endRequestedAt: true,
      updatedAt: true,
      client: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          loyaltyTier: true,
        },
      },
      pendingActions: {
        where: { status: "OPEN" },
        orderBy: { dueAt: "asc" },
        // boardId is the original board for PENDING_RESTYLE — pre-fills the
        // styleboards builder via ?parentBoardId=. Null for every other type.
        select: { type: true, dueAt: true, boardId: true },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { text: true, createdAt: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Tally each client's lifetime session count (excluding soft-deleted) so we
  // can map to the `totalSessions` loyalty-badge hint.
  const clientIds = Array.from(new Set(sessions.map((s) => s.clientId)));
  const sessionCounts = clientIds.length
    ? await prisma.session.groupBy({
        by: ["clientId"],
        where: { clientId: { in: clientIds }, deletedAt: null },
        _count: { _all: true },
      })
    : [];
  const countByClient = new Map(sessionCounts.map((c) => [c.clientId, c._count._all]));

  return sessions.map((s) => {
    const nextAction = s.pendingActions[0] ?? null;
    const isCompleted = s.status === "COMPLETED" || s.status === "CANCELLED";
    const latestMessage = s.messages[0] ?? null;

    let priority: DashboardSessionPriority;
    if (isCompleted) {
      priority = "completed";
    } else if (s.status === "BOOKED") {
      priority = "new";
    } else if (nextAction && nextAction.dueAt < now) {
      priority = "overdue";
    } else if (nextAction && isSameLocalDay(nextAction.dueAt, now)) {
      priority = "due_today";
    } else {
      priority = "active";
    }

    const totalSessions = countByClient.get(s.clientId) ?? 1;
    const lastMessageDate = latestMessage?.createdAt ?? s.updatedAt ?? now;

    const action = deriveDashboardAction({
      sessionId: s.id,
      status: s.status,
      moodboardsSent: s.moodboardsSent,
      styleboardsSent: s.styleboardsSent,
      styleboardsAllowed: s.styleboardsAllowed,
      endRequestedAt: s.endRequestedAt,
      pendingActionType: nextAction?.type ?? null,
      pendingRestyleParentBoardId:
        nextAction?.type === "PENDING_RESTYLE" ? nextAction.boardId ?? null : null,
    });

    return {
      id: s.id,
      clientId: s.clientId,
      clientName: clientDisplayName(
        s.client.firstName,
        s.client.lastName,
        s.client.email,
      ),
      clientInitials: clientInitials(
        s.client.firstName,
        s.client.lastName,
        s.client.email,
      ),
      sessionType: planTypeToSessionType(s.planType),
      priority,
      dueLabel: nextAction
        ? humanDueLabel(nextAction.dueAt, now)
        : s.status === "BOOKED"
          ? "Respond within 24h"
          : "",
      lastMessage: latestMessage?.text ?? statusBlurbFor(nextAction?.type ?? null, s.status),
      lastMessageDate: shortDate(lastMessageDate),
      boardsDelivered: s.styleboardsSent,
      boardsTotal: s.styleboardsAllowed,
      status: statusBlurbFor(nextAction?.type ?? null, s.status),
      actionLabel: action.label,
      actionHref: action.href,
      actionKind: action.kind,
      loyaltyTier: mapLoyaltyTier(s.client.loyaltyTier, totalSessions),
      totalSessions,
      endedAt: s.completedAt?.toISOString() ?? null,
      endRequestedAt: s.endRequestedAt?.toISOString() ?? null,
    };
  });
}
