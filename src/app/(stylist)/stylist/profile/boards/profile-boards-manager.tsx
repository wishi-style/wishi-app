"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Board = {
  id: string;
  profileStyle: string | null;
  isFeaturedOnProfile: boolean;
  coverUrl: string | null;
  createdAt: string;
};

export function ProfileBoardsManager({
  styles,
  initialBoards,
}: {
  styles: string[];
  initialBoards: Board[];
}) {
  const router = useRouter();
  const [boards, setBoards] = useState<Board[]>(initialBoards);
  const [activeStyle, setActiveStyle] = useState<string | null>(styles[0] ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const grouped = useMemo(() => {
    const bucket = new Map<string, Board[]>();
    for (const style of styles) bucket.set(style, []);
    for (const b of boards) {
      if (!b.isFeaturedOnProfile) continue;
      const key = b.profileStyle ?? "";
      const arr = bucket.get(key);
      if (arr) arr.push(b);
    }
    return bucket;
  }, [boards, styles]);

  function addBoard(style: string) {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/stylist/profile/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileStyle: style }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to create board");
        return;
      }
      router.refresh();
    });
  }

  function removeBoard(boardId: string) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/stylist/profile/boards/${boardId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Failed to remove");
        return;
      }
      setBoards((prev) => prev.map((b) => (b.id === boardId ? { ...b, isFeaturedOnProfile: false } : b)));
    });
  }

  if (styles.length === 0) {
    return (
      <div className="rounded border border-dashed border-muted p-6 text-sm text-muted-foreground">
        Pick your style specialties in onboarding step 3 first, then come back.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex gap-2 overflow-x-auto">
        {styles.map((style) => {
          const count = grouped.get(style)?.length ?? 0;
          return (
            <button
              key={style}
              type="button"
              onClick={() => setActiveStyle(style)}
              className={`rounded-full border px-4 py-2 text-sm ${activeStyle === style ? "border-foreground bg-foreground text-background" : "border-muted"}`}
            >
              {style} ({count}/10)
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {activeStyle && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium">{activeStyle}</h2>
            <button
              type="button"
              disabled={isPending || (grouped.get(activeStyle)?.length ?? 0) >= 10}
              onClick={() => addBoard(activeStyle)}
              className="rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background disabled:opacity-50"
            >
              {isPending ? "Adding…" : "+ New board"}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {(grouped.get(activeStyle) ?? []).map((b) => (
              <div key={b.id} className="overflow-hidden rounded-lg border border-muted">
                {b.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={b.coverUrl}
                    alt={`${activeStyle} board`}
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-square items-center justify-center bg-muted text-xs text-muted-foreground">
                    Empty board
                  </div>
                )}
                <div className="flex items-center justify-between p-3 text-xs">
                  <span className="text-muted-foreground">
                    {new Date(b.createdAt).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeBoard(b.id)}
                    className="text-red-700 underline"
                  >
                    Unfeature
                  </button>
                </div>
              </div>
            ))}
          </div>

          {(grouped.get(activeStyle)?.length ?? 0) < 3 && (
            <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              Need at least 3 featured boards in this style for your profile to
              display it.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
