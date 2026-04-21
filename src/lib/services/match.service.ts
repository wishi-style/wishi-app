import { prisma } from "@/lib/prisma";
import type { Gender } from "@/generated/prisma/client";
import { createChatConversation } from "@/lib/chat/create-conversation";
import { canReassignSession } from "./admin-guards";

/**
 * Auto-matcher: assigns the best-fit stylist to a session.
 *
 * Filter: matchEligible + isAvailable + gender overlap + style overlap + budget overlap
 * Rank: lowest active session count, tie-break by oldest profile (longest tenure)
 *
 * If no match found, session stays BOOKED and a stub admin alert fires.
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

  // Get client's match quiz result for filtering
  const quizResult = await prisma.matchQuizResult.findFirst({
    where: { userId: session.clientId },
    orderBy: { completedAt: "desc" },
  });

  const clientGender = quizResult?.genderToStyle ?? null;
  const clientStyles = quizResult?.styleDirection ?? [];
  const clientBudget = quizResult?.budgetBracket ?? null;

  // Find eligible stylists
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
      budgetBrackets: true,
      createdAt: true,
    },
  });

  if (eligibleStylists.length === 0) {
    console.warn(`[match] No eligible stylists for session ${sessionId}`);
    // TODO: stub admin alert
    return null;
  }

  // Score and filter
  const scored = eligibleStylists
    .filter((s) => {
      // Gender filter: if client specified a gender, stylist must support it
      if (clientGender && s.genderPreference.length > 0) {
        return s.genderPreference.includes(clientGender as Gender);
      }
      return true;
    })
    .map((s) => {
      let score = 0;

      // Style overlap
      if (clientStyles.length > 0 && s.styleSpecialties.length > 0) {
        const overlap = clientStyles.filter((cs) =>
          s.styleSpecialties.includes(cs)
        ).length;
        score += overlap * 10;
      }

      // Budget overlap
      if (clientBudget && s.budgetBrackets.includes(clientBudget)) {
        score += 5;
      }

      return { ...s, score };
    });

  if (scored.length === 0) {
    console.warn(`[match] No stylists passed filters for session ${sessionId}`);
    return null;
  }

  // Get active session counts for each eligible stylist
  const stylistUserIds = scored.map((s) => s.userId);
  const activeCounts = await prisma.session.groupBy({
    by: ["stylistId"],
    where: {
      stylistId: { in: stylistUserIds },
      status: { in: ["BOOKED", "ACTIVE", "PENDING_END", "PENDING_END_APPROVAL"] },
      deletedAt: null,
    },
    _count: { id: true },
  });

  const countMap = new Map(
    activeCounts.map((c) => [c.stylistId, c._count.id])
  );

  // Sort: highest match score → lowest workload → oldest profile (tenure)
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aCount = countMap.get(a.userId) ?? 0;
    const bCount = countMap.get(b.userId) ?? 0;
    if (aCount !== bCount) return aCount - bCount;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const bestMatch = scored[0];

  // Assign stylist to session
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

  // Create chat conversation after transaction commits (external API call)
  try {
    await createChatConversation(sessionId);
  } catch (err) {
    console.error(`[match] Failed to create chat conversation for session ${sessionId}:`, err);
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
