import { prisma } from "@/lib/prisma";
import type {
  LoyaltyTier as DbLoyaltyTier,
  PendingActionType,
  PlanType,
} from "@/generated/prisma/client";

export type DashboardSessionType = "mini" | "major" | "lux";
export type DashboardSessionPriority =
  | "overdue"
  | "due_today"
  | "active"
  | "new"
  | "completed";
export type DashboardLoyaltyTier = "new" | "bronze" | "silver" | "gold" | "vip";

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
  loyaltyTier: DashboardLoyaltyTier;
  totalSessions: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function planTypeToSessionType(plan: PlanType): DashboardSessionType {
  if (plan === "MINI") return "mini";
  if (plan === "MAJOR") return "major";
  return "lux";
}

function initialsFor(firstName: string | null, lastName: string | null): string {
  const f = firstName?.trim()?.[0] ?? "";
  const l = lastName?.trim()?.[0] ?? "";
  const joined = `${f}${l}`.toUpperCase();
  return joined || "?";
}

function clientFullName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(" ") || "Client";
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
  const deltaMs = earliestDueAt.getTime() - now.getTime();
  const deltaDays = Math.round(deltaMs / MS_PER_DAY);
  if (isSameLocalDay(earliestDueAt, now)) return "Due Today";
  if (deltaDays > 0) {
    return deltaDays === 1 ? "Due tomorrow" : `Due in ${deltaDays} days`;
  }
  const overdueDays = Math.abs(deltaDays);
  if (overdueDays === 0) return "Due now";
  return `Due: ${overdueDays} day${overdueDays === 1 ? "" : "s"} ago`;
}

function actionLabelFor(type: PendingActionType | null): string {
  switch (type) {
    case "PENDING_MOODBOARD":
      return "Create Moodboard";
    case "PENDING_STYLEBOARD":
      return "Create Look";
    case "PENDING_RESTYLE":
      return "Review Restyle Request";
    case "PENDING_STYLIST_RESPONSE":
    case "PENDING_CLIENT_FEEDBACK":
    case "PENDING_FOLLOWUP":
      return "View Session";
    case "PENDING_END_APPROVAL":
      return "View Session";
    default:
      return "View Session";
  }
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
      updatedAt: true,
      client: {
        select: {
          firstName: true,
          lastName: true,
          loyaltyTier: true,
        },
      },
      pendingActions: {
        where: { status: "OPEN" },
        orderBy: { dueAt: "asc" },
        select: { type: true, dueAt: true },
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

    return {
      id: s.id,
      clientId: s.clientId,
      clientName: clientFullName(s.client.firstName, s.client.lastName),
      clientInitials: initialsFor(s.client.firstName, s.client.lastName),
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
      actionLabel: isCompleted ? "View Session" : actionLabelFor(nextAction?.type ?? null),
      loyaltyTier: mapLoyaltyTier(s.client.loyaltyTier, totalSessions),
      totalSessions,
    };
  });
}
