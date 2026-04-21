import { prisma } from "@/lib/prisma";
import { openAction, resolveAction } from "@/lib/pending-actions";
import { defaultDueAt } from "@/lib/pending-actions/policy";
import {
  sendSystemMessage,
  sendEndSessionRequestMessage,
} from "@/lib/chat/send-message";
import { SystemTemplate } from "@/lib/chat/system-templates";
import { notifyClient, notifyStylist } from "@/lib/notifications/dispatcher";
import { isReadyForPendingEnd } from "./pending-end";
import type { Session, SessionStatus } from "@/generated/prisma/client";

export class SessionTransitionError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly from: SessionStatus,
    public readonly attempted: string,
  ) {
    super(`cannot ${attempted} session ${sessionId} from status ${from}`);
    this.name = "SessionTransitionError";
  }
}

async function loadSession(sessionId: string): Promise<Session> {
  return prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
}

/**
 * BOOKED → ACTIVE. Opens the first PENDING_MOODBOARD action and fires the
 * SESSION_ACTIVATED system message in chat.
 */
export async function activateSession(sessionId: string): Promise<Session> {
  const session = await loadSession(sessionId);
  if (session.status !== "BOOKED") {
    throw new SessionTransitionError(sessionId, session.status, "activate");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.session.update({
      where: { id: sessionId },
      data: { status: "ACTIVE", startedAt: new Date() },
    });
    await openAction(sessionId, "PENDING_MOODBOARD", { tx });
    return s;
  });

  const [client, stylist] = await Promise.all([
    prisma.user.findUnique({ where: { id: updated.clientId }, select: { firstName: true } }),
    updated.stylistId
      ? prisma.user.findUnique({ where: { id: updated.stylistId }, select: { firstName: true } })
      : null,
  ]);

  await sendSystemMessage(sessionId, SystemTemplate.SESSION_ACTIVATED, {
    clientFirstName: client?.firstName ?? "there",
    stylistFirstName: stylist?.firstName ?? "your stylist",
  });

  return updated;
}

/**
 * Derived state: if all required boards are delivered, mark PENDING_END.
 * "Required" = moodboard + the plan's allotted styleboards + any bonus
 * boards granted (revisions don't count against the allowance).
 */
export async function detectPendingEnd(sessionId: string): Promise<Session> {
  const session = await loadSession(sessionId);
  if (session.status !== "ACTIVE") return session;
  if (!isReadyForPendingEnd(session)) return session;

  return prisma.session.update({
    where: { id: sessionId },
    data: { status: "PENDING_END" },
  });
}

/**
 * Stylist-initiated end request. ACTIVE | PENDING_END → PENDING_END_APPROVAL.
 * Writes the END_SESSION_REQUEST chat card and opens the 72h approval action.
 */
export async function requestEnd(sessionId: string): Promise<Session> {
  const session = await loadSession(sessionId);
  if (session.status !== "ACTIVE" && session.status !== "PENDING_END") {
    throw new SessionTransitionError(sessionId, session.status, "requestEnd");
  }

  const now = new Date();
  const deadline = defaultDueAt("PENDING_END_APPROVAL", now);

  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.session.update({
      where: { id: sessionId },
      data: {
        status: "PENDING_END_APPROVAL",
        endRequestedAt: now,
        endApprovalDeadline: deadline,
      },
    });
    await openAction(sessionId, "PENDING_END_APPROVAL", { dueAt: deadline, tx });
    return s;
  });

  const stylist = updated.stylistId
    ? await prisma.user.findUnique({ where: { id: updated.stylistId }, select: { firstName: true } })
    : null;
  await sendEndSessionRequestMessage(sessionId, stylist?.firstName ?? "Your stylist");
  await notifyClient(sessionId, {
    event: "session.end_requested",
    title: "Session wrap-up",
    body: `${stylist?.firstName ?? "Your stylist"} asked to wrap up. Approve or decline within 72h.`,
    url: `/sessions/${sessionId}/workspace`,
  });
  return updated;
}

/**
 * Client approves the end request. PENDING_END_APPROVAL → COMPLETED.
 * Resolves the approval action, writes the approval system message.
 * Tip/rate/review flow lives on the end-session page (Phase 6 placeholder).
 */
export async function approveEnd(sessionId: string): Promise<Session> {
  const session = await loadSession(sessionId);
  if (session.status !== "PENDING_END_APPROVAL") {
    throw new SessionTransitionError(sessionId, session.status, "approveEnd");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.session.update({
      where: { id: sessionId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await resolveAction(sessionId, "PENDING_END_APPROVAL", { tx });
    return s;
  });

  await sendSystemMessage(sessionId, SystemTemplate.END_SESSION_APPROVED, {});

  // Dispatch the completion payout. Mini/Major fires SESSION_COMPLETED,
  // Lux fires LUX_FINAL (LUX_THIRD_LOOK already fired from sendStyleboard).
  // Swallow errors — payout failures should not undo the COMPLETED transition.
  try {
    const { dispatchPayout, completionTriggerFor } = await import(
      "@/lib/payouts/dispatch.service"
    );
    const plan = await prisma.plan.findUnique({
      where: { type: updated.planType },
      select: { payoutTrigger: true },
    });
    if (plan) {
      await dispatchPayout({ sessionId, trigger: completionTriggerFor(plan) });
    }
  } catch (error) {
    console.error("[transitions] approveEnd payout dispatch failed", {
      sessionId,
      error,
    });
  }

  return updated;
}

/**
 * Client declines the end request. PENDING_END_APPROVAL → ACTIVE,
 * resolving the approval action and re-opening PENDING_STYLIST_RESPONSE.
 */
export async function declineEnd(sessionId: string): Promise<Session> {
  const session = await loadSession(sessionId);
  if (session.status !== "PENDING_END_APPROVAL") {
    throw new SessionTransitionError(sessionId, session.status, "declineEnd");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.session.update({
      where: { id: sessionId },
      data: {
        status: "ACTIVE",
        endDeclinedAt: new Date(),
        endRequestedAt: null,
        endApprovalDeadline: null,
      },
    });
    await resolveAction(sessionId, "PENDING_END_APPROVAL", { tx });
    await openAction(sessionId, "PENDING_STYLIST_RESPONSE", { tx });
    return s;
  });

  await sendSystemMessage(sessionId, SystemTemplate.END_SESSION_DECLINED, {});
  await notifyStylist(sessionId, {
    event: "session.end_declined",
    title: "End-session declined",
    body: "Your client declined the end-session request. The session continues.",
    url: `/stylist/sessions/${sessionId}/workspace`,
  });
  return updated;
}

/**
 * Admin / payment-webhook driven: freeze the session when the linked
 * subscription enters PAST_DUE. Allowed from ACTIVE or PENDING_END.
 */
export async function freezeSession(
  sessionId: string,
  reason: string,
): Promise<Session> {
  const session = await loadSession(sessionId);
  if (session.status !== "ACTIVE" && session.status !== "PENDING_END") {
    throw new SessionTransitionError(sessionId, session.status, "freeze");
  }
  return prisma.session.update({
    where: { id: sessionId },
    data: { status: "FROZEN", frozenAt: new Date(), frozenReason: reason },
  });
}

/**
 * FROZEN → ACTIVE once subscription recovers.
 */
export async function unfreezeSession(sessionId: string): Promise<Session> {
  const session = await loadSession(sessionId);
  if (session.status !== "FROZEN") {
    throw new SessionTransitionError(sessionId, session.status, "unfreeze");
  }
  return prisma.session.update({
    where: { id: sessionId },
    data: { status: "ACTIVE", frozenAt: null, frozenReason: null },
  });
}
