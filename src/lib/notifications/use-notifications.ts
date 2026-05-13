"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Notification } from "@/generated/prisma/client";

const POLL_INTERVAL_MS = 10_000;

interface FetchResponse {
  items: Notification[];
  unreadCount: number;
  latestId: string | null;
}

/**
 * Drives the bell badge, the popover list, and toast pop-ups for newly
 * arrived notifications. Polls /api/notifications every 10s.
 *
 * The first successful fetch establishes a baseline — no toast fires for
 * the backlog. Subsequent polls toast for any notification with an id
 * greater than the previously seen `latestId`.
 */
export function useNotifications() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const baselineEstablishedRef = useRef(false);
  const lastSeenIdRef = useRef<string | null>(null);

  const markRead = useCallback(async (id: string) => {
    setItems((prev) =>
      prev.map((n) =>
        n.id === id && !n.readAt ? { ...n, readAt: new Date() } : n,
      ),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
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
    setItems((prev) =>
      prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date() })),
    );
    setUnreadCount(0);
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
    } catch (err) {
      console.warn("[notifications] markAllRead failed:", err);
    }
  }, []);

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
