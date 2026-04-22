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

  async function remove(stylistProfileId: string) {
    setPending(stylistProfileId);
    setStylists((prev) =>
      prev.filter((s) => s.stylistProfileId !== stylistProfileId),
    );
    try {
      await fetch(`/api/favorites/stylists/${stylistProfileId}`, {
        method: "DELETE",
      });
    } catch {
      // Re-add on failure — the network might recover, but the user explicitly
      // asked to remove, so we leave it removed and just clear the spinner.
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
      {stylists.map((s) => (
        <div
          key={s.id}
          className="group relative overflow-hidden rounded-2xl border border-stone-200 bg-white"
        >
          <div className="relative aspect-[4/3] overflow-hidden bg-stone-100">
            {s.stylist.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={s.stylist.avatarUrl}
                alt={s.stylist.name}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-4xl text-stone-300">
                {s.stylist.name.charAt(0)}
              </div>
            )}
            <button
              type="button"
              onClick={() => remove(s.stylistProfileId)}
              disabled={pending === s.stylistProfileId}
              aria-label="Remove from favorites"
              className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-rose-600 backdrop-blur transition-colors hover:bg-white disabled:opacity-60"
            >
              <Heart className="h-4 w-4 fill-current" />
            </button>
          </div>
          <div className="p-4">
            <p className="font-serif text-base text-stone-900">{s.stylist.name}</p>
            {s.stylist.bio && (
              <p className="mt-1 line-clamp-2 text-xs text-stone-500">
                {s.stylist.bio}
              </p>
            )}
            <Link
              href={`/stylists/${s.stylistProfileId}`}
              className="mt-3 inline-flex w-full items-center justify-center rounded-full border border-stone-200 px-5 py-2 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50"
            >
              View Profile
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
