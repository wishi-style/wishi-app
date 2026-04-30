"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import type { FavoriteStylistListItem } from "@/lib/stylists/favorite-stylist.service";

interface Props {
  stylists: FavoriteStylistListItem[];
}

/**
 * Client wrapper that owns optimistic removal of favorited stylists. The
 * server component does the initial render; once a user un-hearts a card we
 * drop it from local state without a full reload.
 */
export function FavoritesTabsClient({ stylists: initial }: Props) {
  const [stylists, setStylists] = useState(initial);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(stylistProfileId: string) {
    setPending(stylistProfileId);
    setError(null);

    // Snapshot the row + position so we can restore on failure.
    const index = stylists.findIndex(
      (s) => s.stylistProfileId === stylistProfileId,
    );
    const removed = index >= 0 ? stylists[index] : null;

    setStylists((prev) =>
      prev.filter((s) => s.stylistProfileId !== stylistProfileId),
    );

    try {
      const res = await fetch(`/api/favorites/stylists/${stylistProfileId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("delete failed");
    } catch {
      if (removed) {
        setStylists((prev) => {
          const next = [...prev];
          next.splice(index, 0, removed);
          return next;
        });
      }
      setError("Couldn't remove this stylist. Please try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
      {stylists.map((s) => (
        <div
          key={s.id}
          className="group relative overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md"
        >
          <div className="relative aspect-[4/3] overflow-hidden bg-muted">
            {s.stylist.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={s.stylist.avatarUrl}
                alt={`${s.stylist.name}'s portfolio`}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center font-display text-4xl text-muted-foreground/40">
                {s.stylist.name.charAt(0)}
              </div>
            )}
            <button
              type="button"
              onClick={() => remove(s.stylistProfileId)}
              disabled={pending === s.stylistProfileId}
              aria-label="Remove from favorites"
              className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 disabled:opacity-60"
            >
              <Heart className="h-4 w-4 fill-current" />
            </button>
          </div>
          <div className="p-5">
            <div className="mb-2 flex items-center gap-3">
              {s.stylist.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.stylist.avatarUrl}
                  alt={s.stylist.name}
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                  {s.stylist.name.charAt(0)}
                </div>
              )}
              <p className="font-display text-base">{s.stylist.name}</p>
            </div>
            {s.stylist.bio && (
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {s.stylist.bio}
              </p>
            )}
            <Link
              href={`/stylists/${s.stylistProfileId}`}
              className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-border px-5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              View Profile
            </Link>
          </div>
        </div>
      ))}
      </div>
    </>
  );
}
