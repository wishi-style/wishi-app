"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, Heart, RefreshCw, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "./use-chat";
import { boardMessageHref } from "./board-href";

export type ViewerRole = "CLIENT" | "STYLIST";

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  sessionId: string;
  viewerRole: ViewerRole;
}

export function MessageBubble({
  message,
  isOwn,
  sessionId,
  viewerRole,
}: MessageBubbleProps) {
  const kind = (message.attributes.kind as string) ?? "TEXT";
  const boardId = (message.attributes.boardId as string) ?? null;

  switch (kind) {
    case "TEXT":
      return <TextMessage message={message} isOwn={isOwn} />;
    case "PHOTO":
      return <PhotoMessage message={message} isOwn={isOwn} />;
    case "MOODBOARD":
      return (
        <MoodBoardMessage
          boardId={boardId}
          href={boardMessageHref({ kind, sessionId, boardId, viewerRole })}
        />
      );
    case "STYLEBOARD":
    case "RESTYLE":
      return (
        <StyleBoardMessage
          boardId={boardId}
          isRestyle={kind === "RESTYLE"}
          body={message.body}
          href={boardMessageHref({ kind, sessionId, boardId, viewerRole })}
          viewerRole={viewerRole}
        />
      );
    case "SINGLE_ITEM":
      return (
        <SingleItemCard
          message={message}
          isOwn={isOwn}
          sessionId={sessionId}
          viewerRole={viewerRole}
        />
      );
    case "END_SESSION_REQUEST":
      return <EndSessionCard sessionId={sessionId} viewerRole={viewerRole} />;
    case "SYSTEM_AUTOMATED":
      return <SystemMessage message={message} />;
    default:
      return <TextMessage message={message} isOwn={isOwn} />;
  }
}

const ownBubble =
  "bg-[hsl(var(--user-bubble))] text-[hsl(var(--user-bubble-foreground))]";
const otherBubble = "bg-card text-foreground border border-border shadow-sm";

function TextMessage({ message, isOwn }: { message: ChatMessage; isOwn: boolean }) {
  return (
    <div
      className={`max-w-2xl rounded-[22px] px-4 py-3 md:px-6 md:py-4 ${
        isOwn ? ownBubble : otherBubble
      }`}
    >
      <p className="whitespace-pre-line text-base leading-7">{message.body}</p>
    </div>
  );
}

function PhotoMessage({ message, isOwn }: { message: ChatMessage; isOwn: boolean }) {
  const mediaUrl = (message.attributes.mediaUrl as string) ?? null;
  return (
    <div
      className={`max-w-2xl overflow-hidden rounded-[22px] ${
        isOwn ? ownBubble : otherBubble
      }`}
    >
      {mediaUrl ? (
        <a href={mediaUrl} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl}
            alt="Shared photo"
            className="max-h-96 w-full max-w-sm object-cover"
          />
        </a>
      ) : (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          Photo unavailable
        </div>
      )}
      {message.body && (
        <p className="px-4 pb-3 pt-2 text-sm leading-relaxed">{message.body}</p>
      )}
    </div>
  );
}

interface MoodBoardSummary {
  id: string;
  description?: string | null;
  photos?: Array<{ id: string; url: string | null }>;
}

function MoodBoardMessage({
  boardId,
  href,
}: {
  boardId: string | null;
  href: string | null;
}) {
  const [board, setBoard] = useState<MoodBoardSummary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!boardId) return;
    let cancelled = false;
    fetch(`/api/moodboards/${boardId}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: MoodBoardSummary) => {
        if (!cancelled) setBoard(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  const photos = (board?.photos ?? [])
    .map((p) => p.url)
    .filter((u): u is string => Boolean(u))
    .slice(0, 6);

  return (
    <div
      className={`max-w-2xl ${otherBubble} overflow-hidden rounded-[22px] p-4 md:p-5`}
    >
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Moodboard
      </p>
      {board?.description && (
        <p className="mt-2 text-sm leading-relaxed">{board.description}</p>
      )}
      {error ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Couldn’t load preview.{" "}
          {href && (
            <Link href={href} className="underline">
              Open
            </Link>
          )}
        </p>
      ) : photos.length === 0 ? (
        <div className="mt-3 grid h-40 place-items-center rounded-md bg-muted text-xs text-muted-foreground">
          {board ? "No photos yet" : "Loading…"}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {photos.map((url, i) => (
            <div
              key={i}
              className="aspect-square overflow-hidden rounded-md bg-muted"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      )}
      {href && (
        <Link
          href={href}
          className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background hover:opacity-90 transition-opacity"
        >
          Review Moodboard
        </Link>
      )}
    </div>
  );
}

interface StyleBoardSummary {
  id: string;
  description?: string | null;
  rating?: string | null;
  items?: Array<{ id: string; orderIndex: number }>;
  photos?: Array<{ id: string; url: string | null; orderIndex: number }>;
}

type Rating = "LOVE" | "REVISE" | "NOT_MY_STYLE";

function StyleBoardMessage({
  boardId,
  isRestyle,
  body,
  href,
  viewerRole,
}: {
  boardId: string | null;
  isRestyle: boolean;
  body: string | null;
  href: string | null;
  viewerRole: ViewerRole;
}) {
  const [board, setBoard] = useState<StyleBoardSummary | null>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState<Rating | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  useEffect(() => {
    if (!boardId) return;
    let cancelled = false;
    Promise.all([
      fetch(`/api/styleboards/${boardId}`, { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : null,
      ),
      fetch(`/api/styleboards/${boardId}/preview`, { cache: "no-store" }).then(
        (r) => (r.ok ? r.json() : null),
      ),
    ])
      .then(([data, preview]) => {
        if (cancelled) return;
        if (data) setBoard(data as StyleBoardSummary);
        if (preview && Array.isArray((preview as { thumbnails?: unknown }).thumbnails)) {
          setThumbs(
            ((preview as { thumbnails: unknown[] }).thumbnails as string[]).filter(
              (u) => typeof u === "string" && u.length > 0,
            ),
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  async function submitRating(rating: Rating) {
    if (!boardId || submitting) return;
    setSubmitting(rating);
    setFeedbackError(null);
    const previous = board;
    // Optimistic — flip the chip + hide the buttons immediately.
    setBoard((b) => (b ? { ...b, rating } : b));
    try {
      const res = await fetch(`/api/styleboards/${boardId}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setBoard(previous);
        setFeedbackError(json.error ?? "Could not save feedback");
      }
    } catch {
      setBoard(previous);
      setFeedbackError("Could not save feedback");
    } finally {
      setSubmitting(null);
    }
  }

  const label = isRestyle ? "Restyle" : "Styleboard";
  const reviewLabel = viewerRole === "CLIENT" ? "Review look" : "View look";
  const canRate =
    viewerRole === "CLIENT" && board != null && !board.rating;
  const ratingPills: Array<{ key: Rating; label: string; icon: typeof Heart }> = [
    { key: "LOVE", label: "Love", icon: Heart },
    { key: "REVISE", label: "Revise", icon: RefreshCw },
    { key: "NOT_MY_STYLE", label: "Not my style", icon: ThumbsDown },
  ];

  return (
    <div
      className={`max-w-2xl ${otherBubble} overflow-hidden rounded-[22px] p-4 md:p-5`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        {board?.rating && (
          <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {board.rating.replaceAll("_", " ").toLowerCase()}
          </span>
        )}
      </div>
      {body && (
        <p className="mt-2 text-base leading-7 whitespace-pre-line">{body}</p>
      )}
      {board?.description && !body && (
        <p className="mt-2 text-base leading-7">{board.description}</p>
      )}
      <div className="mt-3 aspect-square overflow-hidden rounded-md bg-muted">
        {thumbs.length > 0 ? (
          <div className="columns-2 gap-1.5 h-full p-0.5">
            {thumbs.map((url, i) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={i}
                src={url}
                alt={`Look piece ${i + 1}`}
                className="mb-1.5 w-full rounded-sm object-cover"
                loading="lazy"
              />
            ))}
          </div>
        ) : (
          <div className="grid h-full place-items-center text-xs text-muted-foreground">
            {board ? "No items yet" : "Loading preview…"}
          </div>
        )}
      </div>
      {href && (
        <Link
          href={href}
          className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background hover:opacity-90 transition-opacity"
        >
          {reviewLabel}
        </Link>
      )}
      {canRate && (
        <div
          className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4"
          role="group"
          aria-label="Rate this style board"
        >
          {ratingPills.map(({ key, label: pillLabel, icon: Icon }) => (
            <button
              key={key}
              type="button"
              disabled={submitting !== null}
              onClick={() => submitRating(key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-foreground",
                submitting === key && "opacity-60",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {pillLabel}
            </button>
          ))}
        </div>
      )}
      {feedbackError && (
        <p className="mt-2 text-xs text-destructive">{feedbackError}</p>
      )}
    </div>
  );
}

interface ProductSummary {
  id: string;
  canonical_name: string;
  brand_name: string;
  min_price: number;
  max_price: number;
  currency: string;
  in_stock: boolean;
  primary_image_url: string | null;
}

function SingleItemCard({
  message,
  isOwn,
  sessionId,
  viewerRole,
}: {
  message: ChatMessage;
  isOwn: boolean;
  sessionId: string;
  viewerRole: ViewerRole;
}) {
  const productId =
    (message.attributes.singleItemInventoryProductId as string) ?? null;
  const webUrl = (message.attributes.singleItemWebUrl as string) ?? null;
  const [product, setProduct] = useState<ProductSummary | null>(null);
  const [added, setAdded] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    fetch(`/api/products/${productId}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ProductSummary | null) => {
        if (!cancelled && data) setProduct(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const addToCart = () => {
    if (!productId) return;
    startTransition(async () => {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryProductId: productId,
          sessionId,
          quantity: 1,
        }),
      });
      if (res.ok) {
        setAdded(true);
        router.refresh();
      }
    });
  };

  const formatPrice = () => {
    if (!product) return null;
    const formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: product.currency || "USD",
      minimumFractionDigits: 0,
    });
    if (product.min_price === product.max_price) {
      return formatter.format(product.min_price);
    }
    return `${formatter.format(product.min_price)} – ${formatter.format(product.max_price)}`;
  };

  return (
    <div className="max-w-xs">
      {message.body && (
        <div
          className={`mb-2 rounded-[22px] px-4 py-3 md:px-6 md:py-4 ${
            isOwn ? ownBubble : otherBubble
          }`}
        >
          <p className="whitespace-pre-line text-base leading-7">{message.body}</p>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {product?.primary_image_url ? (
          <div className="aspect-square overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={product.primary_image_url}
              alt={product.canonical_name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="grid aspect-square place-items-center bg-muted text-xs text-muted-foreground">
            {product ? "No image" : "Loading…"}
          </div>
        )}
        <div className="p-3 text-center">
          <p className="truncate text-sm font-medium text-foreground">
            {product?.brand_name ?? "—"}
          </p>
          <p className="mt-0.5 text-sm text-foreground">
            {product
              ? product.in_stock
                ? formatPrice()
                : "Sold out"
              : webUrl
                ? "External item"
                : "Loading…"}
          </p>
          {viewerRole === "CLIENT" && product?.in_stock && (
            added ? (
              <div className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-foreground/10 py-2 text-xs font-medium text-foreground">
                <CheckIcon className="h-3 w-3" />
                Added
              </div>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={addToCart}
                className="mt-2.5 w-full rounded-lg bg-foreground py-2 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
              >
                {pending ? "Adding…" : "Add to Cart"}
              </button>
            )
          )}
          {webUrl && !productId && (
            <a
              href={webUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2.5 block w-full rounded-lg border border-border py-2 text-xs font-medium text-foreground hover:bg-secondary"
            >
              View item
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function EndSessionCard({
  sessionId,
  viewerRole,
}: {
  sessionId: string;
  viewerRole: ViewerRole;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function act(action: "approve" | "decline") {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/sessions/${sessionId}/end/${action}`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Failed");
        return;
      }
      if (action === "approve") {
        router.push(`/sessions/${sessionId}/end-session`);
      }
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-[85%] rounded-[22px] border border-border bg-secondary px-4 py-3 text-center">
      <p className="text-sm font-medium text-foreground">
        Session end requested
      </p>
      {viewerRole === "CLIENT" ? (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            Your stylist wants to close out. You have 72 hours to approve.
          </p>
          <div className="mt-3 flex justify-center gap-2">
            <button
              disabled={pending}
              onClick={() => act("approve")}
              className="rounded-full bg-foreground px-5 py-1.5 text-xs text-background disabled:opacity-50"
            >
              Approve
            </button>
            <button
              disabled={pending}
              onClick={() => act("decline")}
              className="rounded-full border border-border px-5 py-1.5 text-xs disabled:opacity-50"
            >
              Decline
            </button>
          </div>
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          Waiting for the client to approve or decline.
        </p>
      )}
    </div>
  );
}

function SystemMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="mx-auto flex w-full max-w-[85%] justify-center py-1">
      <span className="inline-block rounded-full border border-border bg-secondary/50 px-3 py-1 text-center text-xs italic leading-relaxed text-muted-foreground">
        {message.body}
      </span>
    </div>
  );
}
