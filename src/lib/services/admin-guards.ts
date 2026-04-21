import type { SessionStatus, SubscriptionStatus } from "@/generated/prisma/client";

/**
 * Pure predicates for admin session/subscription override guards.
 * Kept separate from service functions so they can be unit-tested
 * without a Prisma client.
 */

const REASSIGNABLE: SessionStatus[] = ["BOOKED", "ACTIVE", "PENDING_END", "FROZEN"];
const FREEZABLE: SessionStatus[] = ["ACTIVE", "PENDING_END"];
const TERMINAL_SESSION: SessionStatus[] = ["COMPLETED", "CANCELLED"];

export function canReassignSession(status: SessionStatus): boolean {
  return REASSIGNABLE.includes(status);
}

export function canFreezeSession(status: SessionStatus): boolean {
  return FREEZABLE.includes(status);
}

export function canUnfreezeSession(status: SessionStatus): boolean {
  return status === "FROZEN";
}

export function canCancelSession(status: SessionStatus): boolean {
  return !TERMINAL_SESSION.includes(status);
}

export function canAdminPauseSubscription(status: SubscriptionStatus): boolean {
  return status === "ACTIVE";
}

export function canAdminCancelSubscription(status: SubscriptionStatus): boolean {
  return status !== "CANCELLED" && status !== "EXPIRED";
}

export function canAdminReactivateSubscription(
  status: SubscriptionStatus,
  hasCancelRequest: boolean,
): boolean {
  return status === "PAUSED" || hasCancelRequest;
}

/**
 * Extract the impersonation actor (admin clerkId) from sessionClaims.
 * Returns null when the session is not impersonating.
 */
export function extractActor(
  sessionClaims: unknown,
): { adminClerkId: string } | null {
  const act = (sessionClaims as { act?: { sub?: string } } | undefined)?.act;
  if (!act?.sub) return null;
  return { adminClerkId: act.sub };
}
