"use client";

import { useEffect, useState } from "react";

/**
 * Chip that surfaces an OPEN SessionPendingAction's due-by deadline on a
 * board viewer. Client-owner boards only — pass the server-resolved `dueAt`
 * (or null when there is no open action) and the chip ticks down every
 * minute until it hits zero, after which it switches to an OVERDUE state.
 *
 * The actual expire/resolve is still driven server-side by the
 * pending-action-expiry worker + the feedback APIs. This component is
 * purely a visual affordance.
 */
export function PendingActionChip({
  dueAt,
  label = "Respond",
}: {
  dueAt: Date | string | null;
  label?: string;
}) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!dueAt) return;
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [dueAt]);

  if (!dueAt) return null;

  const deadline = new Date(dueAt).getTime();
  if (!Number.isFinite(deadline)) return null;

  const remainingMs = deadline - now;
  const overdue = remainingMs <= 0;
  const remaining = formatRemaining(Math.max(remainingMs, 0));

  const className = overdue
    ? "inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700"
    : "inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800";

  return (
    <span className={className} role="status" aria-live="polite">
      <span aria-hidden>⏱</span>
      <span>
        {overdue ? `${label}: overdue` : `${label}: ${remaining} left`}
      </span>
    </span>
  );
}

function formatRemaining(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
  }
  if (hours >= 1) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}
