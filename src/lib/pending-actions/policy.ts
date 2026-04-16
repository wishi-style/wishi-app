import type { PendingActionType } from "@/generated/prisma/client";

const HOUR = 60 * 60 * 1000;

export const DEFAULT_DUE_OFFSETS_MS: Record<PendingActionType, number> = {
  PENDING_MOODBOARD: 24 * HOUR,
  PENDING_STYLEBOARD: 48 * HOUR,
  PENDING_CLIENT_FEEDBACK: 72 * HOUR,
  PENDING_RESTYLE: 48 * HOUR,
  PENDING_STYLIST_RESPONSE: 6 * HOUR,
  PENDING_FOLLOWUP: 72 * HOUR,
  PENDING_END_APPROVAL: 72 * HOUR,
};

export function defaultDueAt(type: PendingActionType, from: Date = new Date()): Date {
  return new Date(from.getTime() + DEFAULT_DUE_OFFSETS_MS[type]);
}
