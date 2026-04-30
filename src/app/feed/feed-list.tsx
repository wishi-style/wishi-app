"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart, ShoppingBag } from "lucide-react";
import type {
  FeedBoard,
  FeedGender,
  FeedPage,
  FeedProduct,
} from "@/lib/feed/feed.service";
import { PillButton } from "@/components/primitives/pill-button";
import { cn } from "@/lib/utils";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";

function formatPrice(cents: number | null): string | null {
  if (cents === null) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function ProductTile({ product }: { product: FeedProduct }) {
  const price = formatPrice(product.priceInCents);
  const tile = (
    <>
      <div className="aspect-square overflow-hidden bg-muted/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.imageUrl}
          alt={product.brand ?? product.name ?? "Product"}
          className="h-full w-full object-contain p-3 transition-transform duration-300 group-hover/prod:scale-105"
          loading="lazy"
        />
      </div>
      <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 shadow-sm backdrop-blur">
        <ShoppingBag className="h-3.5 w-3.5 text-foreground" />
      </span>
      <div className="border-t border-border px-3 py-2.5">
        <p className="truncate font-body text-[11px] uppercase tracking-wider text-foreground">
          {product.brand ?? product.name ?? "—"}
        </p>
        {price ? (
          <p className="mt-0.5 font-body text-xs text-muted-foreground">
            {price}
          </p>
        ) : null}
      </div>
    </>
  );
  const className =
    "group/prod relative overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-foreground/40";
  if (product.url) {
    return (
      <a
        href={product.url}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {tile}
      </a>
    );
  }
  return <div className={className}>{tile}</div>;
}

function FeedCard({
  board,
  onToggleFavorite,
}: {
  board: FeedBoard;
  onToggleFavorite: () => void;
}) {
  const firstName = board.stylist.name.split(" ")[0] || board.stylist.name;
  const initials = board.stylist.name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const hasProducts = board.products.length > 0;

  return (
    <article className="group">
      <div
        className={cn(
          "grid items-stretch gap-4 md:gap-6",
          hasProducts ? "grid-cols-1 md:grid-cols-[1.4fr_1fr]" : "grid-cols-1",
        )}
      >
        {/* Left: title bar + look image + stylist row */}
        <div className="relative flex flex-col overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between px-4 pb-2 pt-3 md:px-5 md:pt-4">
            <span className="w-7" />
            <h3 className="truncate px-2 text-center font-display text-base italic text-foreground md:text-lg">
              {board.title ?? `Look by ${firstName}`}
            </h3>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite();
              }}
              aria-label={
                board.isFavorited ? "Remove from favorites" : "Save look"
              }
              aria-pressed={board.isFavorited}
              className="shrink-0 p-1 transition-opacity hover:opacity-70"
            >
              <Heart
                className={cn(
                  "h-5 w-5",
                  board.isFavorited
                    ? "fill-foreground text-foreground"
                    : "text-foreground",
                )}
              />
            </button>
          </div>

          <Link
            href={`/stylists/${board.stylist.profileId}`}
            className="block aspect-square overflow-hidden"
          >
            {board.coverImageUrl ? (
              <Image
                src={board.coverImageUrl}
                alt={board.title ?? `Look by ${board.stylist.name}`}
                width={800}
                height={800}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted font-display text-5xl text-muted-foreground">
                {board.stylist.name.charAt(0)}
              </div>
            )}
          </Link>

          {/* Stylist row + Book CTA */}
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-border px-4 py-3 md:px-5">
            <Link
              href={`/stylists/${board.stylist.profileId}`}
              className="group/stylist flex min-w-0 items-center gap-2.5"
            >
              <Avatar className="h-7 w-7 shrink-0">
                {board.stylist.avatarUrl ? (
                  <AvatarImage
                    src={board.stylist.avatarUrl}
                    alt={board.stylist.name}
                  />
                ) : null}
                <AvatarFallback className="font-body text-[10px]">
                  {initials || board.stylist.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate font-body text-sm text-foreground group-hover/stylist:underline">
                {board.stylist.name}
              </span>
            </Link>
            <Link
              href={`/select-plan?stylistId=${board.stylist.profileId}`}
              className="shrink-0 rounded-full bg-foreground px-3 py-2 font-body text-xs tracking-wide text-background transition-colors hover:bg-foreground/90 md:px-4"
            >
              book {firstName.toLowerCase()}
            </Link>
          </div>
        </div>

        {/* Right: product grid — Loveable Feed FeedCard.tsx:82-143. Mobile is
            a horizontal scroll-snap row; desktop is a vertical-scrolling 2-col
            grid that matches the left column's height with a bottom fade. */}
        {hasProducts ? (
          <div className="relative -mx-4 md:mx-0 md:h-full">
            <div className="scrollbar-thin snap-x snap-mandatory overflow-x-auto px-4 md:hidden">
              <div className="flex gap-3 pb-1">
                {board.products.map((p) => (
                  <div
                    key={p.id}
                    className="w-[42vw] max-w-[180px] shrink-0 snap-start"
                  >
                    <ProductTile product={p} />
                  </div>
                ))}
              </div>
            </div>
            <div className="scrollbar-thin absolute inset-0 hidden overflow-y-auto pr-1 md:block">
              <div className="grid grid-cols-2 gap-3">
                {board.products.map((p) => (
                  <ProductTile key={p.id} product={p} />
                ))}
              </div>
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-10 rounded-b-lg bg-gradient-to-t from-background to-transparent md:block"
            />
          </div>
        ) : null}
      </div>
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
      <Link
        href="/gift-cards"
        className="inline-flex items-center justify-center border border-foreground rounded-[4px] px-4 md:px-5 py-2 text-xs hover:bg-foreground hover:text-background transition-colors shrink-0"
      >
        Buy gift card
      </Link>
    </div>
  );
}

export function FeedList({
  initialPage,
  gender,
  isAuthed,
}: {
  initialPage: FeedPage;
  gender: FeedGender;
  isAuthed: boolean;
}) {
  const router = useRouter();
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

  const toggleFavorite = useCallback(
    async (boardId: string) => {
      if (!isAuthed) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/feed")}`);
        return;
      }
      const target = boards.find((b) => b.id === boardId);
      if (!target) return;
      const nextFavorited = !target.isFavorited;
      setBoards((bs) =>
        bs.map((b) =>
          b.id === boardId ? { ...b, isFavorited: nextFavorited } : b,
        ),
      );
      try {
        const res = nextFavorited
          ? await fetch("/api/favorites/boards", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ boardId }),
            })
          : await fetch(
              `/api/favorites/boards?boardId=${encodeURIComponent(boardId)}`,
              { method: "DELETE" },
            );
        if (!res.ok) {
          setBoards((bs) =>
            bs.map((b) =>
              b.id === boardId ? { ...b, isFavorited: !nextFavorited } : b,
            ),
          );
        }
      } catch {
        setBoards((bs) =>
          bs.map((b) =>
            b.id === boardId ? { ...b, isFavorited: !nextFavorited } : b,
          ),
        );
      }
    },
    [boards, isAuthed, router],
  );

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
            <FeedCard
              board={b}
              onToggleFavorite={() => toggleFavorite(b.id)}
            />
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
