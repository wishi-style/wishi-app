"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Notification } from "@/generated/prisma/client";

const POLL_INTERVAL_MS = 10_000;

/**
 * Wire-format Notification — Date columns arrive as strings after JSON
 * round-trip. The Notification type from Prisma carries `Date` for
 * those, which is misleading on the client. Define the DTO explicitly
 * so consumers know to wrap with `new Date(…)` before doing date math.
 */
export interface NotificationDTO
  extends Omit<Notification, "createdAt" | "readAt"> {
  createdAt: string;
  readAt: string | null;
}

interface FetchResponse {
  items: NotificationDTO[];
  unreadCount: number;
  latestId: string | null;
}

/**
 * Drives the bell badge, the popover list, and toast pop-ups for newly
 * arrived notifications. Polls /api/notifications every 10s.
 *
 * The first successful fetch establishes a baseline — no toast fires for
 * the backlog. Subsequent polls toast for any notification with an id
 * greater than the previously seen `latestId`. Lex comparison on CUIDs
 * is intentional: Prisma's @default(cuid()) IDs are designed to sort
 * lexicographically by creation time, so id-newer-than maps exactly to
 * created-after for our schema.
 */
export function useNotifications() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const itemsRef = useRef<NotificationDTO[]>([]);
  const baselineEstablishedRef = useRef(false);
  const lastSeenIdRef = useRef<string | null>(null);

  // Keep a ref in sync with items so callbacks can inspect current state
  // without depending on `items` (which would invalidate `useCallback`
  // identity on every render).
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const markRead = useCallback(async (id: string) => {
    const target = itemsRef.current.find((n) => n.id === id);
    const wasUnread = !!target && !target.readAt;
    if (wasUnread) {
      const nowIso = new Date().toISOString();
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: nowIso } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    } catch (err) {
      console.warn("[notifications] markRead failed:", err);
    }
  }, []);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data: FetchResponse = await res.json();
      setItems(data.items);
      setUnreadCount(data.unreadCount);

      if (!baselineEstablishedRef.current) {
        lastSeenIdRef.current = data.latestId;
        baselineEstablishedRef.current = true;
        return;
      }

      const newOnes = data.items.filter((n) =>
        lastSeenIdRef.current === null
          ? true
          : n.id > lastSeenIdRef.current,
      );
      for (const n of newOnes) {
        toast(n.title, {
          description: n.body,
          action: n.href
            ? {
                label: "View",
                onClick: () => {
                  void markRead(n.id);
                  router.push(n.href!);
                },
              }
            : undefined,
        });
      }
      if (data.latestId) lastSeenIdRef.current = data.latestId;
    } catch (err) {
      console.warn("[notifications] poll failed:", err);
    }
  }, [router, markRead]);

  const markAllRead = useCallback(async () => {
    if (unreadCount === 0) return;
    const nowIso = new Date().toISOString();
    setItems((prev) =>
      prev.map((n) => (n.readAt ? n : { ...n, readAt: nowIso })),
    );
    setUnreadCount(0);
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
    } catch (err) {
      console.warn("[notifications] markAllRead failed:", err);
    }
  }, [unreadCount]);

  useEffect(() => {
    // Defer initial fetch by a tick so its setState calls don't fire
    // synchronously inside the effect (cascading-renders lint rule).
    const initialId = setTimeout(() => void refetch(), 0);
    const intervalId = setInterval(() => void refetch(), POLL_INTERVAL_MS);
    return () => {
      clearTimeout(initialId);
      clearInterval(intervalId);
    };
  }, [refetch]);

  return { items, unreadCount, markRead, markAllRead, refetch };
}
