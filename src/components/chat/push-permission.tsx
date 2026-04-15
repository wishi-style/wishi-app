"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

function getPermission() {
  if (typeof window === "undefined") return "default";
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  return Notification.permission;
}

const noopSubscribe = () => () => {};

export function PushPermission() {
  const initial = useSyncExternalStore(noopSubscribe, getPermission, () => "default");
  const [permission, setPermission] = useState(initial);

  const subscribe = useCallback(async () => {
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return;

      const registration = await navigator.serviceWorker.register("/sw.js");
      const vapidPublicKey = await fetch("/api/push/vapid-key")
        .then((r) => r.json())
        .then((d) => d.key);

      if (!vapidPublicKey) return;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidPublicKey,
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
    } catch (err) {
      console.error("[push] Subscription failed:", err);
    }
  }, []);

  if (permission !== "default") return null;

  return (
    <div className="border-t border-stone-200 bg-stone-50 px-4 py-2.5 text-center">
      <button
        type="button"
        onClick={subscribe}
        className="text-xs text-teal-600 underline hover:text-teal-700"
      >
        Enable notifications to know when your stylist replies
      </button>
    </div>
  );
}
