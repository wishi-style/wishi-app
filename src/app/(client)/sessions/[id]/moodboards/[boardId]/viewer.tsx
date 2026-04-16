"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BoardPhoto, BoardRating } from "@/generated/prisma/client";

interface Props {
  boardId: string;
  photos: BoardPhoto[];
  rating: BoardRating | null;
  canRate: boolean;
}

export function MoodboardViewer({ boardId, photos, rating, canRate }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notMyStyle, setNotMyStyle] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");

  function submit(nextRating: "LOVE" | "NOT_MY_STYLE") {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/moodboards/${boardId}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rating: nextRating,
          feedbackText: nextRating === "NOT_MY_STYLE" ? feedbackText : undefined,
        }),
      });
      if (!res.ok) {
        setError("Failed to submit");
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        {photos.map((p) => (
          <img
            key={p.id}
            src={p.url}
            alt=""
            className="aspect-[3/4] w-full rounded object-cover"
          />
        ))}
      </div>

      {rating && (
        <p className="text-sm text-muted-foreground">
          You already rated this moodboard: <strong>{rating}</strong>
        </p>
      )}

      {canRate && !notMyStyle && (
        <div className="flex gap-3">
          <button
            disabled={pending}
            onClick={() => submit("LOVE")}
            className="rounded-full bg-foreground px-6 py-2 text-sm text-background disabled:opacity-50"
          >
            Love it
          </button>
          <button
            disabled={pending}
            onClick={() => setNotMyStyle(true)}
            className="rounded-full border px-6 py-2 text-sm hover:bg-foreground hover:text-background disabled:opacity-50"
          >
            Not my style
          </button>
        </div>
      )}

      {canRate && notMyStyle && (
        <div className="max-w-xl">
          <p className="mb-2 text-sm">Tell your stylist what felt off:</p>
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            className="mb-3 w-full rounded border p-2 text-sm"
            rows={4}
          />
          <div className="flex gap-3">
            <button
              disabled={pending}
              onClick={() => submit("NOT_MY_STYLE")}
              className="rounded-full bg-foreground px-6 py-2 text-sm text-background disabled:opacity-50"
            >
              Send feedback
            </button>
            <button
              disabled={pending}
              onClick={() => setNotMyStyle(false)}
              className="rounded-full border px-6 py-2 text-sm disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </>
  );
}
