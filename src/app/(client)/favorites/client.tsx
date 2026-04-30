"use client";

import { useState } from "react";
import Link from "next/link";
import { HeartIcon } from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { FavoriteLookCard, FavoriteStylistCard } from "./page";

interface Props {
  looks: FavoriteLookCard[];
  stylists: FavoriteStylistCard[];
}

export function FavoritesClient({
  looks: initialLooks,
  stylists: initialStylists,
}: Props) {
  const [looks, setLooks] = useState(initialLooks);
  const [stylists, setStylists] = useState(initialStylists);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function removeLook(favId: string, boardId: string) {
    setPending(favId);
    setError(null);
    const index = looks.findIndex((l) => l.id === favId);
    const removed = index >= 0 ? looks[index] : null;
    setLooks((prev) => prev.filter((l) => l.id !== favId));
    try {
      const res = await fetch(
        `/api/favorites/boards?boardId=${encodeURIComponent(boardId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("delete failed");
    } catch {
      if (removed) {
        setLooks((prev) => {
          const next = [...prev];
          next.splice(index, 0, removed);
          return next;
        });
      }
      setError("Couldn't remove this look. Please try again.");
    } finally {
      setPending(null);
    }
  }

  async function removeStylist(stylistProfileId: string) {
    setPending(stylistProfileId);
    setError(null);
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
    <Tabs defaultValue="looks" className="w-full">
      <TabsList className="mb-8">
        <TabsTrigger value="looks" className="font-body text-sm">
          Looks ({looks.length})
        </TabsTrigger>
        <TabsTrigger value="stylists" className="font-body text-sm">
          Stylists ({stylists.length})
        </TabsTrigger>
      </TabsList>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}

      {/* ─── Looks Grid ─── */}
      <TabsContent value="looks">
        {looks.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {looks.map((look) => (
              <div key={look.id} className="group relative">
                <div className="aspect-[3/4] overflow-hidden rounded-xl bg-muted">
                  {look.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={look.image}
                      alt={look.description}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center font-display text-3xl text-muted-foreground/30">
                      {look.description.charAt(0)}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeLook(look.id, look.boardId)}
                  disabled={pending === look.id}
                  aria-label="Remove from favorites"
                  className="absolute top-2 right-2 h-8 w-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-60"
                >
                  <HeartIcon className="h-4 w-4 fill-foreground text-foreground" />
                </button>
                <div className="mt-3">
                  {look.sessionId ? (
                    <Link
                      href={`/sessions/${look.sessionId}`}
                      className="block font-body text-sm font-medium text-foreground truncate hover:underline"
                    >
                      {look.description}
                    </Link>
                  ) : (
                    <p className="font-body text-sm font-medium text-foreground truncate">
                      {look.description}
                    </p>
                  )}
                  <p className="font-body text-xs text-muted-foreground mt-0.5">
                    by {look.stylist} · {look.savedDate}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No saved looks yet"
            body="Explore style boards and save the looks you love."
            ctaHref="/sessions"
            ctaLabel="Browse Style Boards"
          />
        )}
      </TabsContent>

      {/* ─── Stylists Grid ─── */}
      <TabsContent value="stylists">
        {stylists.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {stylists.map((stylist) => (
              <div
                key={stylist.id}
                className="group relative rounded-xl border border-border bg-card overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="aspect-[4/3] overflow-hidden bg-muted">
                  {stylist.portfolioUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={stylist.portfolioUrl}
                      alt={`${stylist.name}'s portfolio`}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center font-display text-4xl text-muted-foreground/40">
                      {stylist.firstName.charAt(0)}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeStylist(stylist.stylistProfileId)}
                  disabled={pending === stylist.stylistProfileId}
                  aria-label="Remove from favorites"
                  className="absolute top-3 right-3 h-8 w-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-60"
                >
                  <HeartIcon className="h-4 w-4 fill-foreground text-foreground" />
                </button>
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-2">
                    {stylist.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={stylist.avatarUrl}
                        alt={stylist.name}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground font-body text-xs">
                        {stylist.firstName.charAt(0)}
                      </div>
                    )}
                    <div>
                      <p className="font-display text-base">{stylist.name}</p>
                      {stylist.location && (
                        <p className="font-body text-xs text-muted-foreground">
                          {stylist.location}
                        </p>
                      )}
                    </div>
                  </div>
                  {stylist.specialty && (
                    <p className="font-body text-xs text-muted-foreground">
                      {stylist.specialty}
                    </p>
                  )}
                  <Link
                    href={`/stylists/${stylist.stylistProfileId}`}
                    className="mt-4 inline-flex items-center justify-center rounded-full border border-border px-5 py-2 text-xs font-body font-medium text-foreground hover:bg-muted transition-colors w-full"
                  >
                    View Profile
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No favorite stylists yet"
            body="Discover stylists and save the ones you love."
            ctaHref="/discover"
            ctaLabel="Discover Stylists"
          />
        )}
      </TabsContent>
    </Tabs>
  );
}

function EmptyState({
  title,
  body,
  ctaHref,
  ctaLabel,
}: {
  title: string;
  body: React.ReactNode;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <div className="text-center py-20">
      <HeartIcon className="h-10 w-10 text-muted-foreground/40 mx-auto mb-4" />
      <p className="font-display text-xl mb-2">{title}</p>
      <p className="font-body text-sm text-muted-foreground mb-6">{body}</p>
      <Link
        href={ctaHref}
        className="inline-flex items-center justify-center rounded-full bg-foreground text-background px-8 py-3 text-sm font-body font-medium hover:bg-foreground/90 transition-colors"
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
