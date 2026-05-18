"use client";

import { useEffect, useState } from "react";
import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MoodBoardWizard } from "@/components/boards/moodboard-wizard";
import { BoardThumbnail } from "@/components/boards/board-thumbnail";
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
  canvasMode?: string | null;
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
 * `rating` is derived by majority vote across images: each image with at
 * least one chip selected is classified positive ("Would wear" / "Love the
 * vibe") or negative; LOVE wins on ties. The full per-image structure is
 * preserved on Board.feedbackDetail so we can grow the UI (and the rating
 * heuristic) without losing fidelity.
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
      ) : reviewed && viewerRole === "STYLIST" && board ? (
        <StylistAnnotatedGrid
          photos={board.photos ?? []}
          feedbackDetail={board.feedbackDetail}
          rating={board.rating ?? null}
          feedbackText={board.feedbackText ?? null}
        />
      ) : (
        <div className="mb-5">
          <BoardThumbnail
            type="MOODBOARD"
            canvasMode={board?.canvasMode ?? null}
            photoUrls={photos}
          />
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

const POSITIVE_REASONS = new Set(["Would wear", "Love the vibe"]);

function classifyReasons(reasons: string[]): "positive" | "negative" | "neutral" {
  if (!reasons || reasons.length === 0) return "neutral";
  return reasons.some((r) => POSITIVE_REASONS.has(r)) ? "positive" : "negative";
}

function ratingLabelFor(rating: string | null): string | null {
  if (!rating) return null;
  if (rating === "LOVE") return "Loved it";
  if (rating === "NOT_MY_STYLE") return "Not my style";
  return rating.replaceAll("_", " ").toLowerCase();
}

/**
 * Stylist post-review layout: each image is annotated with the client's
 * reaction directly beneath it, so chips/notes are unambiguously bound to
 * the image they describe. Replaces the previous "Image N: …" text list
 * which forced the stylist to count their way through a multi-column
 * mosaic to map feedback back to images.
 */
function StylistAnnotatedGrid({
  photos,
  feedbackDetail,
  rating,
  feedbackText,
}: {
  photos: Array<{ id: string; url: string | null }>;
  feedbackDetail: unknown;
  rating: string | null;
  feedbackText: string | null;
}) {
  const detail =
    feedbackDetail && typeof feedbackDetail === "object"
      ? (feedbackDetail as Record<string, PerImageDetail>)
      : {};
  const ratingLabel = ratingLabelFor(rating);

  const hasAnyDetail = Object.values(detail).some(
    (v) => (v?.reasons?.length ?? 0) > 0 || (v?.note ?? "").trim().length > 0,
  );

  return (
    <div className="mb-5 space-y-4">
      {ratingLabel && (
        <div className="flex items-center gap-2 rounded-full bg-muted/60 px-3 py-1.5 text-xs">
          <span className="font-medium uppercase tracking-widest text-muted-foreground">
            Client said
          </span>
          <span className="font-medium text-foreground">{ratingLabel}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {photos.map((photo, i) => {
          if (!photo.url) return null;
          const fb = detail[String(i)];
          const reasons = fb?.reasons ?? [];
          const note = fb?.note?.trim() ?? "";
          const tone = classifyReasons(reasons);
          const ringClass =
            tone === "positive"
              ? "ring-2 ring-teal/60"
              : tone === "negative"
                ? "ring-2 ring-burgundy/40"
                : "ring-1 ring-border";
          const chipClass =
            tone === "positive"
              ? "bg-teal/10 text-teal"
              : "bg-burgundy/10 text-burgundy";
          return (
            <div key={photo.id} className="space-y-2">
              <div className={`overflow-hidden rounded-md ${ringClass}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={`Mood board ${i + 1}`}
                  className="aspect-[3/4] w-full object-cover"
                  loading="lazy"
                />
              </div>
              {reasons.length === 0 && !note ? (
                <p className="text-[11px] text-muted-foreground/60">
                  No reaction
                </p>
              ) : (
                <div className="space-y-1">
                  {reasons.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {reasons.map((r) => (
                        <span
                          key={r}
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${chipClass}`}
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  )}
                  {note && (
                    <p className="text-[11px] italic text-muted-foreground">
                      “{note}”
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!hasAnyDetail && feedbackText && (
        <p className="whitespace-pre-line border-t border-border pt-4 text-xs text-foreground">
          {feedbackText}
        </p>
      )}
    </div>
  );
}
