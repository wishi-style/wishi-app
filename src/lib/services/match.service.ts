import { prisma } from "@/lib/prisma";
import type { Gender } from "@/generated/prisma/client";
import { createChatConversation } from "@/lib/chat/create-conversation";
import { openAction } from "@/lib/pending-actions";
import { dispatchNotification, notifyClient, notifyStylist } from "@/lib/notifications/dispatcher";
import { stripe } from "@/lib/stripe";
import { canReassignSession } from "./admin-guards";

/**
 * Pure ranking pipeline — returns scored stylists for a given client without
 * touching Session state. Shared by:
 *   - the pre-booking preview (/stylist-match)
 *   - the post-booking auto-assign (matchStylistForSession)
 *
 * Filter: matchEligible + isAvailable + gender overlap.
 * Score: +10 per style overlap.
 * Rank: highest score → lowest active session count → oldest profile.
 *
 * Budget is intentionally NOT a match criterion — captured at /select-plan.
 */
export type RankedStylist = {
  id: string;
  userId: string;
  genderPreference: Gender[];
  styleSpecialties: string[];
  createdAt: Date;
  score: number;
};

export async function rankStylistsForClient(
  clientUserId: string,
): Promise<RankedStylist[]> {
  const quizResult = await prisma.matchQuizResult.findFirst({
    where: { userId: clientUserId },
    orderBy: { completedAt: "desc" },
  });

  const clientGender = quizResult?.genderToStyle ?? null;
  const clientStyles = quizResult?.styleDirection ?? [];

  const eligibleStylists = await prisma.stylistProfile.findMany({
    where: {
      matchEligible: true,
      isAvailable: true,
      user: { deletedAt: null },
    },
    select: {
      id: true,
      userId: true,
      genderPreference: true,
      styleSpecialties: true,
      createdAt: true,
    },
  });

  if (eligibleStylists.length === 0) return [];

  const filtered = eligibleStylists.filter((s) => {
    if (clientGender && s.genderPreference.length > 0) {
      return s.genderPreference.includes(clientGender as Gender);
    }
    return true;
  });

  const scored: RankedStylist[] = filtered.map((s) => {
    let score = 0;
    if (clientStyles.length > 0 && s.styleSpecialties.length > 0) {
      const overlap = clientStyles.filter((cs) =>
        s.styleSpecialties.includes(cs),
      ).length;
      score += overlap * 10;
    }
    return { ...s, score };
  });

  if (scored.length === 0) return [];

  // Workload tie-break: pull active session counts for the surviving set only.
  const userIds = scored.map((s) => s.userId);
  const activeCounts = await prisma.session.groupBy({
    by: ["stylistId"],
    where: {
      stylistId: { in: userIds },
      status: { in: ["BOOKED", "ACTIVE", "PENDING_END", "PENDING_END_APPROVAL"] },
      deletedAt: null,
    },
    _count: { id: true },
  });
  const countMap = new Map(activeCounts.map((c) => [c.stylistId, c._count.id]));

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aCount = countMap.get(a.userId) ?? 0;
    const bCount = countMap.get(b.userId) ?? 0;
    if (aCount !== bCount) return aCount - bCount;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return scored;
}

/**
 * Single activation pipeline for newly-paid sessions. Handles both:
 *   - Auto-match (no stylistId at creation) — runs ranker, picks top stylist.
 *   - Explicit-stylist booking (stylistId set at creation) — skips ranker,
 *     uses the pre-selected stylist.
 *
 * Atomically: assigns stylist (if needed), flips BOOKED → ACTIVE, opens
 * PENDING_MOODBOARD, writes SessionMatchHistory. Then creates the Twilio
 * conversation (best-effort — `sendTwilioMessage` self-heals later) and
 * sends SESSION_ACTIVATED + booking notifications.
 *
 * Returns null when the session is not BOOKED or no eligible stylist.
 */
export async function matchStylistForSession(sessionId: string) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: {
      id: true,
      clientId: true,
      stylistId: true,
      status: true,
      planType: true,
    },
  });

  if (session.status !== "BOOKED") return null;

  let assignedStylistId = session.stylistId;
  if (!assignedStylistId) {
    const ranked = await rankStylistsForClient(session.clientId);
    if (ranked.length === 0) {
      console.warn(`[match] No eligible stylists for session ${sessionId}`);
      return null;
    }
    assignedStylistId = ranked[0].userId;
  }

  await prisma.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: sessionId, status: "BOOKED" },
      data: {
        stylistId: assignedStylistId,
        status: "ACTIVE",
        startedAt: new Date(),
      },
    });
    await tx.sessionMatchHistory.create({
      data: {
        sessionId,
        clientId: session.clientId,
        stylistId: assignedStylistId!,
      },
    });
    await openAction(sessionId, "PENDING_MOODBOARD", { tx });
  });

  // Twilio conversation — best-effort. `getConversationSid` self-heals on
  // first send if this fails.
  try {
    await createChatConversation(sessionId);
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "create_chat_conversation_failed",
        sessionId,
        err: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      }),
    );
  }

  // Loveable contract: the WELCOME bubble already fired from
  // createChatConversation; no additional "session activated" stage bubble is
  // dispatched here. Push + email notifications still fan out so both sides
  // get paged off-session.
  try {
    const [client, stylist] = await Promise.all([
      prisma.user.findUnique({ where: { id: session.clientId }, select: { firstName: true } }),
      prisma.user.findUnique({ where: { id: assignedStylistId! }, select: { firstName: true } }),
    ]);

    await notifyClient(sessionId, {
      event: "session.activated",
      title: "Your stylist is ready",
      body: `${stylist?.firstName ?? "Your stylist"} is paired with you. Open the chat to say hi.`,
      url: `/sessions/${sessionId}/chat`,
    });
    await notifyStylist(sessionId, {
      event: "session.booked",
      title: "New booking",
      body: `${client?.firstName ?? "A client"} just booked a session with you.`,
      url: `/stylist/dashboard?session=${sessionId}`,
    });
  } catch (err) {
    console.error("[match] post-activation messaging failed", { sessionId, err });
  }

  return { sessionId, stylistUserId: assignedStylistId };
}

/**
 * Admin override: reassign a session's stylist. Closes the previous
 * SessionMatchHistory row and writes a new one with `reason`.
 */
export async function reassignStylist({
  sessionId,
  newStylistUserId,
  reason,
}: {
  sessionId: string;
  newStylistUserId: string;
  reason: string;
}) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: { id: true, clientId: true, stylistId: true, status: true },
  });

  if (session.stylistId === newStylistUserId) {
    throw new Error("Session is already assigned to this stylist");
  }

  if (!canReassignSession(session.status)) {
    throw new Error(`Cannot reassign session in status ${session.status}`);
  }

  await prisma.$transaction([
    prisma.sessionMatchHistory.updateMany({
      where: { sessionId, unmatchedAt: null },
      data: { unmatchedAt: new Date() },
    }),
    prisma.session.update({
      where: { id: sessionId },
      data: { stylistId: newStylistUserId },
    }),
    prisma.sessionMatchHistory.create({
      data: {
        sessionId,
        clientId: session.clientId,
        stylistId: newStylistUserId,
        reason,
      },
    }),
  ]);

  return {
    sessionId,
    previousStylistId: session.stylistId,
    newStylistId: newStylistUserId,
  };
}

/**
 * Admin override: cancel an active session. Cascades the cleanup that the
 * session lifecycle would otherwise do at COMPLETED:
 *   - Resolves all open PendingActions to prevent orphan reminders.
 *   - Refunds the session's Stripe payment (one-time bookings; subscriptions
 *     are handled separately via subscription cancellation).
 *   - Notifies both client and stylist.
 *
 * Twilio conversation is left intact so participants can still see history.
 * AuditLog row is captured at the call site.
 */
export async function adminCancelSession({
  sessionId,
  reason,
}: {
  sessionId: string;
  reason?: string;
}) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: {
      status: true,
      clientId: true,
      stylistId: true,
      stripePaymentIntentId: true,
      isMembership: true,
    },
  });

  if (session.status === "COMPLETED" || session.status === "CANCELLED") {
    throw new Error(`Session already in status ${session.status}`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: sessionId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    // Close any open PendingActions so neither side keeps seeing them on the
    // dashboard or in expiry notifications.
    await tx.sessionPendingAction.updateMany({
      where: { sessionId, status: "OPEN" },
      data: { status: "EXPIRED" },
    });
  });

  // One-time bookings: issue a Stripe refund. Subscription cancellations are
  // handled by the dedicated `subscription.deleted` webhook flow.
  if (!session.isMembership && session.stripePaymentIntentId) {
    try {
      await stripe.refunds.create(
        {
          payment_intent: session.stripePaymentIntentId,
          reason: "requested_by_customer",
          metadata: {
            sessionId,
            kind: "admin_cancel",
            ...(reason ? { reason } : {}),
          },
        },
        {
          idempotencyKey: `admin-cancel-${sessionId}`,
        },
      );
      await prisma.payment.updateMany({
        where: { sessionId, type: "SESSION", status: "SUCCEEDED" },
        data: { status: "REFUNDED" },
      });
    } catch (err) {
      console.error("[admin] cancel-session refund failed", { sessionId, err });
    }
  }

  // Notify both parties.
  try {
    const [client, stylist] = await Promise.all([
      prisma.user.findUnique({ where: { id: session.clientId }, select: { firstName: true } }),
      session.stylistId
        ? prisma.user.findUnique({ where: { id: session.stylistId }, select: { firstName: true } })
        : null,
    ]);
    await dispatchNotification({
      event: "session.cancelled",
      userId: session.clientId,
      title: "Session cancelled",
      body: "Your session was cancelled. A refund is on its way if applicable.",
      url: `/sessions`,
    });
    if (session.stylistId) {
      await dispatchNotification({
        event: "session.cancelled",
        userId: session.stylistId,
        title: "Session cancelled",
        body: `${client?.firstName ?? "Your client"}'s session was cancelled.`,
        url: `/stylist/dashboard`,
      });
    }
    void stylist; // keep readable destructure
  } catch (err) {
    console.error("[admin] cancel-session notify failed", { sessionId, err });
  }

  return { sessionId };
}
