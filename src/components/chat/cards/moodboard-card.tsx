"use client";

import { useEffect, useState } from "react";
import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MoodBoardWizard } from "@/components/boards/moodboard-wizard";
import type { ChatMessage } from "../use-chat";
import type { ViewerRole } from "../message-renderers";

// Verbatim port of smart-spark-craft/src/components/MoodBoard.tsx (HEAD on
// origin/main). The Loveable contract: card lives inline in the chat stream,
// not on a separate page. The "Review Mood Board" button opens the
// MoodBoardWizard modal in place. Once submitted the card flips to show a
// "Reviewed" check, the button label becomes "View My Feedback", and the
// wizard reopens read-only-ish (initialFeedback prefilled).

interface MoodBoardSummary {
  id: string;
  description?: string | null;
  stylistNote?: string | null;
  rating?: string | null;
  feedbackText?: string | null;
  feedbackDetail?: unknown;
  ratedAt?: string | null;
  photos?: Array<{ id: string; url: string | null }>;
}

interface PerImageDetail {
  reasons?: string[];
  note?: string;
}

function defaultMessage(clientName: string | null) {
  return `Hey ${clientName ?? "there"}! Here is your mood board I put together for you. I incorporated a mix of cool chic looks for your upcoming events and beyond. Although this is purely inspirational, I would love to hear your thoughts on this general style direction!`;
}

function derivePersistedFeedback(
  feedbackDetail: unknown,
): {
  initialFeedback: Record<number, string[]>;
  initialNotes: Record<number, string>;
} {
  const fb: Record<number, string[]> = {};
  const notes: Record<number, string> = {};
  if (!feedbackDetail || typeof feedbackDetail !== "object") {
    return { initialFeedback: fb, initialNotes: notes };
  }
  const detail = feedbackDetail as Record<string, PerImageDetail>;
  for (const [key, value] of Object.entries(detail)) {
    const idx = Number(key);
    if (!Number.isFinite(idx)) continue;
    if (value?.reasons) fb[idx] = value.reasons;
    if (value?.note) notes[idx] = value.note;
  }
  return { initialFeedback: fb, initialNotes: notes };
}

/**
 * Maps the Loveable per-image wizard payload onto the Wishi feedback API.
 * `rating` is derived: any image marked positive ("Would wear" / "Love the
 * vibe") with no explicit negative gives LOVE; otherwise NOT_MY_STYLE. The
 * full per-image structure is preserved on Board.feedbackDetail so we can
 * grow the UI without losing fidelity.
 */
function summariseFeedback(
  feedback: Record<number, string[]>,
  notes: Record<number, string>,
): {
  rating: "LOVE" | "NOT_MY_STYLE";
  feedbackText: string | null;
  feedbackDetail: Record<string, PerImageDetail>;
} {
  const positives = ["Would wear", "Love the vibe"];
  let positive = 0;
  let negative = 0;
  for (const reasons of Object.values(feedback)) {
    if (!reasons || reasons.length === 0) continue;
    if (reasons.some((r) => positives.includes(r))) positive += 1;
    else negative += 1;
  }
  const rating: "LOVE" | "NOT_MY_STYLE" = positive >= negative ? "LOVE" : "NOT_MY_STYLE";

  const detail: Record<string, PerImageDetail> = {};
  const lines: string[] = [];
  const keys = new Set<string>([
    ...Object.keys(feedback),
    ...Object.keys(notes),
  ]);
  for (const key of keys) {
    const idx = Number(key);
    const reasons = feedback[idx] ?? [];
    const note = notes[idx]?.trim() ?? "";
    if (reasons.length === 0 && !note) continue;
    detail[key] = { reasons, note };
    const parts: string[] = [];
    if (reasons.length) parts.push(reasons.join(", "));
    if (note) parts.push(note);
    if (parts.length) lines.push(`Image ${idx + 1}: ${parts.join(" — ")}`);
  }
  return {
    rating,
    feedbackText: lines.length ? lines.join("\n") : null,
    feedbackDetail: detail,
  };
}

export function MoodboardCard({
  boardId,
  viewerRole,
  chatMessages,
}: {
  boardId: string | null;
  viewerRole: ViewerRole;
  chatMessages?: ChatMessage[];
}) {
  const [board, setBoard] = useState<MoodBoardSummary | null>(null);
  const [error, setError] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!boardId) return;
    let cancelled = false;
    fetch(`/api/moodboards/${boardId}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: MoodBoardSummary) => {
        if (!cancelled) setBoard(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  // Realtime BOARD_UPDATE subscription. Watches the chat stream for any
  // BOARD_UPDATE event matching our boardId and re-fetches the summary.
  // This is what flips the stylist's open card to show the rating + feedback
  // the moment the client submits the wizard, without dispatching a stage
  // bubble. Effect re-runs whenever a new message arrives (length change is
  // sufficient — BOARD_UPDATE is append-only).
  const boardUpdateCount = chatMessages?.filter(
    (m) => m.attributes.kind === "BOARD_UPDATE" && m.attributes.boardId === boardId,
  ).length ?? 0;
  useEffect(() => {
    if (!boardId || boardUpdateCount === 0) return;
    let cancelled = false;
    fetch(`/api/moodboards/${boardId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: MoodBoardSummary | null) => {
        if (!cancelled && data) setBoard(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [boardId, boardUpdateCount]);

  const photos = (board?.photos ?? [])
    .map((p) => p.url)
    .filter((u): u is string => Boolean(u));

  const reviewed = Boolean(board?.rating);
  const message = board?.stylistNote?.trim() || board?.description?.trim() || defaultMessage(null);

  // Hydrate wizard initial state from the persisted feedbackDetail when the
  // client reopens the wizard to "View My Feedback". Derived (not stateful)
  // so a fresh board fetch flows straight through. React Compiler memoises
  // the function-call result automatically.
  const { initialFeedback, initialNotes } = derivePersistedFeedback(
    board?.feedbackDetail,
  );

  const submitWizard = async (
    feedback: Record<number, string[]>,
    notes: Record<number, string>,
  ) => {
    if (!boardId) return;
    if (reviewed) {
      // Read-only re-open — just close.
      setWizardOpen(false);
      return;
    }
    setSubmitError(null);
    const summary = summariseFeedback(feedback, notes);
    try {
      const res = await fetch(`/api/moodboards/${boardId}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rating: summary.rating,
          feedbackText: summary.feedbackText,
          feedbackDetail: summary.feedbackDetail,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setSubmitError(json.error ?? "Couldn't save feedback");
        return;
      }
      const updated = (await res.json()) as MoodBoardSummary;
      setBoard(updated);
      setWizardOpen(false);
    } catch {
      setSubmitError("Couldn't save feedback");
    }
  };

  return (
    <div className="max-w-lg rounded-lg border border-border bg-card p-6 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-heading text-2xl">Mood Board</h3>
        {reviewed && (
          <span className="flex items-center gap-1.5 text-xs text-accent">
            <CheckIcon className="h-3.5 w-3.5" />
            Reviewed
          </span>
        )}
      </div>
      <p className="mb-5 text-base leading-7 text-foreground">{message}</p>

      {error ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Couldn’t load preview.
        </p>
      ) : photos.length === 0 ? (
        <div className="mb-5 grid h-40 place-items-center rounded-md bg-muted text-xs text-muted-foreground">
          {board ? "No photos yet" : "Loading…"}
        </div>
      ) : (
        <div className="columns-3 gap-1.5 mb-5">
          {photos.map((src, i) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={i}
              src={src}
              alt={`Mood board inspiration ${i + 1}`}
              className="mb-1.5 w-full rounded-sm object-cover"
              loading="lazy"
            />
          ))}
        </div>
      )}

      {viewerRole === "CLIENT" && photos.length > 0 && (
        <Button
          onClick={() => setWizardOpen(true)}
          variant="outline"
          className="w-full rounded-lg border-foreground py-5 text-sm text-foreground transition-colors hover:bg-foreground hover:text-background"
        >
          {reviewed ? "View My Feedback" : "Review Mood Board"}
        </Button>
      )}

      {/* Stylist sees the rating + per-image feedback summary inline so they
          can act on it without re-opening the wizard. The card flipping with
          this content IS the signal — Loveable's "card update is the signal"
          contract, adapted for the cross-actor case. */}
      {reviewed && viewerRole === "STYLIST" && board && (
        <FeedbackSummary
          rating={board.rating ?? null}
          feedbackText={board.feedbackText ?? null}
          feedbackDetail={board.feedbackDetail}
        />
      )}

      {submitError && (
        <p className="mt-2 text-xs text-destructive">{submitError}</p>
      )}

      {viewerRole === "CLIENT" && photos.length > 0 && (
        <MoodBoardWizard
          open={wizardOpen}
          images={photos}
          initialFeedback={initialFeedback}
          initialNotes={initialNotes}
          onClose={() => setWizardOpen(false)}
          onComplete={submitWizard}
        />
      )}
    </div>
  );
}

function FeedbackSummary({
  rating,
  feedbackText,
  feedbackDetail,
}: {
  rating: string | null;
  feedbackText: string | null;
  feedbackDetail: unknown;
}) {
  const detail =
    feedbackDetail && typeof feedbackDetail === "object"
      ? (feedbackDetail as Record<string, PerImageDetail>)
      : null;
  const entries = detail
    ? Object.entries(detail).filter(
        ([, v]) => (v?.reasons?.length ?? 0) > 0 || (v?.note ?? "").trim().length > 0,
      )
    : [];
  const ratingLabel = rating
    ? rating.replaceAll("_", " ").toLowerCase()
    : null;
  const hasContent = ratingLabel || feedbackText || entries.length > 0;
  if (!hasContent) return null;

  return (
    <div className="mt-5 space-y-3 border-t border-border pt-5">
      {ratingLabel && (
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Client said: <span className="text-foreground">{ratingLabel}</span>
        </p>
      )}
      {entries.length > 0 && (
        <ul className="space-y-2">
          {entries.map(([key, value]) => (
            <li
              key={key}
              className="rounded-md bg-muted/40 px-3 py-2 text-xs text-foreground"
            >
              <p className="font-medium text-muted-foreground">
                Image {Number(key) + 1}
              </p>
              {value?.reasons && value.reasons.length > 0 && (
                <p className="mt-0.5">{value.reasons.join(", ")}</p>
              )}
              {value?.note && (
                <p className="mt-0.5 italic text-muted-foreground">
                  “{value.note}”
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {feedbackText && entries.length === 0 && (
        <p className="whitespace-pre-line text-xs text-foreground">{feedbackText}</p>
      )}
    </div>
  );
}
