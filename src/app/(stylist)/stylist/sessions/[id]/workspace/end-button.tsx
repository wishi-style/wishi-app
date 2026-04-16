"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function StylistEndSessionButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (!confirm("Send an end-session request to the client?")) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/sessions/${sessionId}/end/request`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Failed");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        onClick={onClick}
        disabled={pending}
        className="rounded-full bg-foreground px-4 py-1.5 text-sm text-background disabled:opacity-50"
      >
        {pending ? "Sending…" : "Request to end session"}
      </button>
    </div>
  );
}
