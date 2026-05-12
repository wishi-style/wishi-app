"use client";

// Stylist's profile-boards manager. Lists featured boards bucketed by style
// and provides two creation entry points via the +New board picker:
//   1. Moodboard — inspiration-image collage
//   2. Styleboard — shoppable canvas built from the LookCreator
// Both creation paths land at sessionless variants of the existing builders.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type BoardType = "MOODBOARD" | "STYLEBOARD";

type Board = {
  id: string;
  type: BoardType;
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
  // Local optimistic overlay for unfeature actions. Keyed by id; the prop
  // remains the source of truth so router.refresh() reflects new boards
  // created via the picker without a stale `useState(initialBoards)` lock.
  const [unfeaturedLocally, setUnfeaturedLocally] = useState<Set<string>>(
    new Set(),
  );
  const [activeStyle, setActiveStyle] = useState<string | null>(styles[0] ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const boards = useMemo(
    () =>
      initialBoards.map((b) =>
        unfeaturedLocally.has(b.id) ? { ...b, isFeaturedOnProfile: false } : b,
      ),
    [initialBoards, unfeaturedLocally],
  );

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
      setUnfeaturedLocally((prev) => {
        const next = new Set(prev);
        next.add(boardId);
        return next;
      });
      router.refresh();
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
              onClick={() => setPickerOpen(true)}
              className="rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background disabled:opacity-50"
            >
              + New board
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
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {b.type === "STYLEBOARD" ? "Look" : "Moodboard"}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(b.createdAt).toLocaleDateString()}
                    </span>
                  </div>
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

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-md rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">
              Create from a session
            </DialogTitle>
            <DialogDescription className="font-body text-sm text-muted-foreground">
              While you&apos;re styling a client, the save dialog now has a{" "}
              <span className="font-medium text-foreground">
                Also feature on my profile
              </span>{" "}
              toggle plus a style picker. Looks and moodboards built that way
              will appear here.
            </DialogDescription>
          </DialogHeader>
          <p className="font-body text-xs text-muted-foreground">
            Standalone creation from this page is coming soon — it&apos;ll launch the
            same LookCreator and moodboard builder, just without a client
            attached.
          </p>
          <div className="flex justify-end pt-2">
            <Link
              href="/stylist/dashboard"
              onClick={() => setPickerOpen(false)}
              className="rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background"
            >
              Go to dashboard
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
