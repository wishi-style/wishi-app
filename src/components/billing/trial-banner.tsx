"use client";

import { useSyncExternalStore } from "react";
import { X } from "lucide-react";

const DISMISS_KEY = "wishi.trialBanner.dismissed";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSnapshot(): boolean {
  return sessionStorage.getItem(DISMISS_KEY) === "1";
}

function getServerSnapshot(): boolean {
  return false;
}

export interface TrialBannerProps {
  trialEndsAt: Date | string | null;
  planName: string;
}

export function TrialBanner({ trialEndsAt, planName }: TrialBannerProps) {
  const dismissed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  if (dismissed) return null;

  const dateLabel = trialEndsAt
    ? new Date(trialEndsAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    // Fire a synthetic storage event so useSyncExternalStore picks up the change.
    window.dispatchEvent(new StorageEvent("storage", { key: DISMISS_KEY }));
  };

  return (
    <div className="bg-secondary/50 border-b border-border">
      <div className="mx-auto max-w-6xl px-6 py-2.5 flex items-center gap-3">
        <p className="text-sm font-body text-foreground">
          <span className="font-medium">{planName} trial.</span> Trial ends when you rate
          your first board
          {dateLabel ? (
            <>
              , or on <span className="font-medium">{dateLabel}</span>
            </>
          ) : null}
          .
        </p>
        <button
          onClick={dismiss}
          className="ml-auto p-1 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
