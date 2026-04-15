"use client";

import { useState } from "react";

interface WaitlistButtonProps {
  stylistProfileId: string;
}

export function WaitlistButton({ stylistProfileId }: WaitlistButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleClick() {
    setState("loading");
    try {
      const res = await fetch(`/api/stylists/${stylistProfileId}/waitlist`, {
        method: "POST",
      });
      if (res.ok) {
        setState("success");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <p className="rounded-full border border-stone-300 bg-stone-50 px-8 py-3 text-sm font-medium text-stone-600">
        ✓ You&apos;re on the waitlist
      </p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={state === "loading"}
        className="rounded-full border border-black bg-white px-8 py-3 text-sm font-medium text-black transition-colors hover:bg-stone-50 disabled:opacity-60"
      >
        {state === "loading" ? "Joining…" : "Join Waitlist"}
      </button>
      {state === "error" && (
        <p className="text-xs text-red-500">Something went wrong. Please try again.</p>
      )}
    </div>
  );
}
