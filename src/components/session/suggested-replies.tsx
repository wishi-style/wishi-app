"use client";

import * as React from "react";

/**
 * Suggested Replies surface for stylists composing messages in chat.
 *
 * Flag-gated — `NEXT_PUBLIC_FEATURE_AI_SUGGESTED_REPLIES`. Currently reads
 * a canned starter set; Phase 7 swaps the `fetchPills` call for a real LLM
 * call against the last few messages in the thread without changing this
 * consumer.
 *
 * A future extension will let clicking a pill prefill the chat textarea.
 * We publish a `suggested-reply` CustomEvent so the pre-existing chat
 * input wrapper can listen without coupling the two components.
 */
export function SuggestedReplies({ sessionId }: { sessionId: string }) {
  const [pills, setPills] = React.useState<string[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    // Session-scoped suggested-replies endpoint — stubbed in Phase 10,
    // LLM-backed in Phase 7. The contract is `{ replies: string[] }`.
    fetch(`/api/ai/suggested-replies/${sessionId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { replies: [] }))
      .then((data: { replies?: string[] }) => {
        if (cancelled) return;
        setPills(data.replies ?? []);
      })
      .catch(() => {
        if (!cancelled) setPills([]);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const choose = (reply: string) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("wishi:suggested-reply", { detail: { reply } }),
    );
  };

  if (pills == null) return null;
  if (pills.length === 0) return null;

  return (
    <div className="border-t border-border bg-muted/30 px-3 py-2 overflow-x-auto">
      <div className="flex items-center gap-2 whitespace-nowrap">
        <span className="text-[10px] uppercase tracking-widest text-dark-taupe pr-1">
          Suggested
        </span>
        {pills.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => choose(p)}
            className="flex-shrink-0 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
