"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { FeedBoard, FeedGender, FeedPage } from "@/lib/feed/feed.service";
import { PillButton } from "@/components/primitives/pill-button";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";

function FeedCard({ board }: { board: FeedBoard }) {
  const initials = board.stylist.name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card">
      <Link
        href={`/stylists/${board.stylist.profileId}`}
        className="flex items-center gap-3 px-4 py-3"
      >
        <Avatar className="h-10 w-10 border border-border">
          {board.stylist.avatarUrl ? (
            <AvatarImage src={board.stylist.avatarUrl} alt={board.stylist.name} />
          ) : null}
          <AvatarFallback className="text-xs bg-secondary text-secondary-foreground">
            {initials || board.stylist.name.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="font-display text-base leading-tight truncate">
            {board.stylist.name}
          </p>
          {board.profileStyle ? (
            <p className="text-xs text-muted-foreground capitalize">
              {board.profileStyle.toLowerCase()}
            </p>
          ) : null}
        </div>
      </Link>
      <Link
        href={`/stylists/${board.stylist.profileId}`}
        className="block group"
      >
        <div className="relative aspect-[4/5] overflow-hidden bg-muted">
          {board.coverImageUrl ? (
            <Image
              src={board.coverImageUrl}
              alt={board.title ?? `Look by ${board.stylist.name}`}
              fill
              sizes="(min-width: 768px) 600px, 100vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-display text-5xl text-muted-foreground">
              {board.stylist.name.charAt(0)}
            </div>
          )}
        </div>
      </Link>
      {board.title ? (
        <div className="px-4 py-4">
          <p className="text-sm text-foreground leading-snug">
            <span className="font-medium">{board.stylist.name.split(" ")[0]}</span>{" "}
            {board.title}
          </p>
        </div>
      ) : null}
    </article>
  );
}

function GiftCardPromoBanner() {
  return (
    <div className="rounded-lg bg-card border border-border p-4 md:p-5 flex items-center justify-between gap-3 md:gap-4">
      <div className="flex items-center gap-3 md:gap-4 min-w-0">
        <div className="h-10 w-14 shrink-0 rounded-md overflow-hidden relative bg-muted">
          <Image
            src="/img/gift-card-icon.png"
            alt="Gift card"
            fill
            sizes="56px"
            className="object-cover"
          />
        </div>
        <h3 className="font-display text-sm md:text-base truncate">
          Give the gift of style
        </h3>
      </div>
      <a
        href="https://wishi.me/gift-cards/choose"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center border border-foreground rounded-[4px] px-4 md:px-5 py-2 text-xs hover:bg-foreground hover:text-background transition-colors shrink-0"
      >
        Buy gift card
      </a>
    </div>
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
      <div className="mx-auto max-w-2xl flex flex-col gap-8 md:gap-12">
        {boards.map((b, i) => (
          <div key={b.id}>
            <FeedCard board={b} />
            {i === 2 ? (
              <div className="mt-8 md:mt-12">
                <GiftCardPromoBanner />
              </div>
            ) : null}
          </div>
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
