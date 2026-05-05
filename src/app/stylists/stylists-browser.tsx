"use client";

import { useMemo, useState } from "react";
import { SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { StylistCard } from "@/components/stylist/stylist-card";

export interface StylistRow {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
  styleSpecialties: string[];
  matchScore: number | null;
  isAvailable: boolean;
  portfolioUrl: string | null;
  location: string | null;
}

interface Props {
  isLoggedIn: boolean;
  matched: StylistRow[];
  all: StylistRow[];
  initialFavoriteIds: string[];
  firstName: string | null;
}

/**
 * Verbatim port of smart-spark-craft Stylists.tsx — handles the All /
 * Favorites tab toggle, name search, and heart-toggle persistence. Mock
 * stylist arrays are replaced by server-fetched data; everything else is
 * lifted from the source.
 */
export function StylistsBrowser({
  isLoggedIn,
  matched,
  all,
  initialFavoriteIds,
  firstName,
}: Props) {
  const [favorites, setFavorites] = useState<Set<string>>(
    () => new Set(initialFavoriteIds),
  );
  const [activeTab, setActiveTab] = useState<"all" | "favorites">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const toggleFavorite = (stylistProfileId: string) => {
    const isFavorited = favorites.has(stylistProfileId);

    setFavorites((prev) => {
      const next = new Set(prev);
      if (isFavorited) {
        next.delete(stylistProfileId);
      } else {
        next.add(stylistProfileId);
      }
      return next;
    });

    // Fire-and-forget — kept outside the state updater so the optimistic
    // commit isn't held back behind an async transition while a previous
    // toggle's fetch is still in flight.
    const request = isFavorited
      ? fetch(`/api/favorites/stylists/${stylistProfileId}`, {
          method: "DELETE",
        })
      : fetch("/api/favorites/stylists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stylistProfileId }),
        });
    request.catch(() => {
      // Optimistic update already applied; the server reconciles on next
      // page load. Surfacing the failure inline is not part of Loveable's
      // contract for this card.
    });
  };

  const enrich = (s: StylistRow): StylistRow => ({ ...s });

  // On the Favorites tab, source from the full universe so favorites
  // saved on top-3 match cards surface here too — `all` excludes those by
  // construction in the server component. On the All tab, keep the
  // original split (matched cards live in their own section above).
  const discoverList = useMemo(() => {
    const source = activeTab === "favorites" ? [...matched, ...all] : all;
    return source.map(enrich).filter((s) => {
      if (activeTab === "favorites" && !favorites.has(s.id)) return false;
      if (
        searchQuery &&
        !s.name.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [matched, all, activeTab, favorites, searchQuery]);

  const showMatchedSection =
    isLoggedIn && matched.length > 0 && activeTab !== "favorites";

  return (
    <>
      {/* Your Stylists Match — only for logged-in users with matched data,
          and hidden on the Favorites tab so favorited matches show in the
          single Discover/Favorites grid below without duplication. */}
      {showMatchedSection ? (
        <section className="container max-w-5xl py-12 md:py-16">
          <div className="text-center mb-10">
            <h1 className="font-display text-3xl md:text-4xl">
              Your Stylists Match!
            </h1>
            <p className="font-body text-sm text-muted-foreground mt-2">
              {firstName ? `${firstName}, meet` : "Meet"} your {matched.length}{" "}
              best {matched.length === 1 ? "match" : "matches"}.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {matched.map((s) => (
              <StylistCard
                key={s.id}
                {...s}
                favorited={favorites.has(s.id)}
                onToggleFavorite={() => toggleFavorite(s.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* Discover More Stylists */}
      <section
        className={cn(
          "container max-w-5xl pb-16",
          !showMatchedSection && "pt-12 md:pt-16",
        )}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="font-display text-2xl md:text-3xl">
              Discover More Stylists
            </h2>
            {isLoggedIn ? (
              <div className="flex items-center gap-4 mt-3">
                {(["all", "favorites"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "font-body text-sm pb-1 border-b-2 transition-colors",
                      activeTab === tab
                        ? "text-foreground font-medium border-foreground"
                        : "text-muted-foreground border-transparent hover:text-foreground",
                    )}
                  >
                    {tab === "all" ? "All Stylists" : "Favorites"}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="relative w-full sm:w-64">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search stylists by name"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm font-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
            />
          </div>
        </div>

        {discoverList.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {discoverList.map((s) => (
              <StylistCard
                key={s.id}
                {...s}
                favorited={favorites.has(s.id)}
                onToggleFavorite={
                  isLoggedIn ? () => toggleFavorite(s.id) : undefined
                }
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="font-body text-sm text-muted-foreground">
              {activeTab === "favorites"
                ? "No favorite stylists yet. Tap the heart to save your favorites."
                : "No stylists found matching your search."}
            </p>
          </div>
        )}
      </section>
    </>
  );
}
