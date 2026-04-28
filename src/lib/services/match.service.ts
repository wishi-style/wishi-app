import { prisma } from "@/lib/prisma";
import type { Gender } from "@/generated/prisma/client";
import { createChatConversation } from "@/lib/chat/create-conversation";
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
 * Auto-matcher: assigns the best-fit stylist to a BOOKED session and
 * creates the chat conversation. Wraps rankStylistsForClient + Session
 * + SessionMatchHistory writes. Returns null when no eligible stylists.
 */
export async function matchStylistForSession(sessionId: string) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: {
      id: true,
      clientId: true,
      status: true,
    },
  });

  if (session.status !== "BOOKED") return null;

  const ranked = await rankStylistsForClient(session.clientId);
  if (ranked.length === 0) {
    console.warn(`[match] No eligible stylists for session ${sessionId}`);
    return null;
  }

  const bestMatch = ranked[0];

  await prisma.$transaction([
    prisma.session.update({
      where: { id: sessionId },
      data: {
        stylistId: bestMatch.userId,
        status: "ACTIVE",
        startedAt: new Date(),
      },
    }),
    prisma.sessionMatchHistory.create({
      data: {
        sessionId,
        clientId: session.clientId,
        stylistId: bestMatch.userId,
      },
    }),
  ]);

  try {
    await createChatConversation(sessionId);
  } catch (err) {
    console.error(
      `[match] Failed to create chat conversation for session ${sessionId}:`,
      err,
    );
  }

  return bestMatch;
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
 * Admin override: cancel an active session. Reason is captured in AuditLog
 * at the call site (not on the session row) to avoid a schema change.
 */
export async function adminCancelSession({ sessionId }: { sessionId: string }) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: { status: true },
  });

  if (session.status === "COMPLETED" || session.status === "CANCELLED") {
    throw new Error(`Session already in status ${session.status}`);
  }

  await prisma.session.update({
    where: { id: sessionId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  return { sessionId };
}
