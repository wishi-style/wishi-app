"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { FeedBoard, FeedGender, FeedPage } from "@/lib/feed/feed.service";
import { PillButton } from "@/components/primitives/pill-button";

function FeedCard({ board }: { board: FeedBoard }) {
  return (
    <Link
      href={`/stylists/${board.stylist.profileId}`}
      className="group flex flex-col"
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-muted">
        {board.coverImageUrl ? (
          <Image
            src={board.coverImageUrl}
            alt={board.title ?? `Look by ${board.stylist.name}`}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-display text-3xl text-muted-foreground">
            {board.stylist.name.charAt(0)}
          </div>
        )}
      </div>
      <div className="mt-3">
        <p className="font-display text-base leading-snug">
          {board.title ?? "Untitled look"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {board.stylist.name}
          {board.profileStyle ? ` · ${board.profileStyle.toLowerCase()}` : null}
        </p>
      </div>
    </Link>
  );
}

export function FeedList({
  initialPage,
  gender,
}: {
  initialPage: FeedPage;
  gender: FeedGender;
}) {
  const [boards, setBoards] = useState<FeedBoard[]>(initialPage.boards);
  const [cursor, setCursor] = useState<string | null>(initialPage.nextCursor);
  const [loading, setLoading] = useState(false);

  const loadMore = useCallback(async () => {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/feed?gender=${gender}&cursor=${encodeURIComponent(cursor)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const next: FeedPage = await res.json();
      setBoards((b) => [...b, ...next.boards]);
      setCursor(next.nextCursor);
    } finally {
      setLoading(false);
    }
  }, [cursor, gender, loading]);

  if (boards.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        No looks yet. Check back soon.
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
        {boards.map((b) => (
          <FeedCard key={b.id} board={b} />
        ))}
      </div>
      {cursor ? (
        <div className="mt-10 flex justify-center">
          <PillButton
            variant="outline"
            size="md"
            onClick={loadMore}
            disabled={loading}
          >
            {loading ? "Loading…" : "Load more"}
          </PillButton>
        </div>
      ) : null}
    </>
  );
}
