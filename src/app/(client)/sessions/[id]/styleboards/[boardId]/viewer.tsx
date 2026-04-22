"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import type {
  BoardItem,
  BoardRating,
  ClosetItem,
  InspirationPhoto,
} from "@/generated/prisma/client";
import { PendingActionChip } from "@/components/boards/pending-action-chip";

interface Props {
  boardId: string;
  items: BoardItem[];
  rating: BoardRating | null;
  canRate: boolean;
  closetItems: ClosetItem[];
  inspiration: InspirationPhoto[];
  pendingDueAt: Date | string | null;
}

const SUGGESTED_FEEDBACK = [
  "Over my budget",
  "I have something similar",
  "Wrong color",
  "Not my style",
  "Too bold",
  "Too structured for me",
  "Prefer a different length",
];

export function StyleboardViewer({
  boardId,
  items,
  rating,
  canRate,
  closetItems,
  inspiration,
  pendingDueAt,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showRevise, setShowRevise] = useState(false);
  const [notMyStyle, setNotMyStyle] = useState(false);
  const [boardFeedback, setBoardFeedback] = useState("");
  const [itemFeedback, setItemFeedback] = useState<
    Record<string, { reasons: string[]; note: string }>
  >({});

  function toggleReason(itemId: string, reason: string) {
    setItemFeedback((prev) => {
      const cur = prev[itemId] ?? { reasons: [], note: "" };
      const has = cur.reasons.includes(reason);
      return {
        ...prev,
        [itemId]: {
          ...cur,
          reasons: has
            ? cur.reasons.filter((r) => r !== reason)
            : [...cur.reasons, reason],
        },
      };
    });
  }

  function setItemNote(itemId: string, note: string) {
    setItemFeedback((prev) => ({
      ...prev,
      [itemId]: { reasons: prev[itemId]?.reasons ?? [], note },
    }));
  }

  function submit(nextRating: BoardRating) {
    setError(null);
    startTransition(async () => {
      const body: {
        rating: BoardRating;
        feedbackText?: string;
        itemFeedback?: Array<{
          itemId: string;
          reaction: BoardRating;
          feedbackText?: string;
          suggestedFeedback?: string[];
        }>;
      } = { rating: nextRating };
      if (nextRating === "REVISE") {
        body.itemFeedback = Object.entries(itemFeedback)
          .filter(([, v]) => v.reasons.length > 0 || v.note.length > 0)
          .map(([itemId, v]) => ({
            itemId,
            reaction: "REVISE",
            feedbackText: v.note || undefined,
            suggestedFeedback: v.reasons,
          }));
      } else if (nextRating === "NOT_MY_STYLE") {
        body.feedbackText = boardFeedback || undefined;
      }
      const res = await fetch(`/api/styleboards/${boardId}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError("Failed to submit");
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      {canRate && pendingDueAt && (
        <div className="mb-4">
          <PendingActionChip dueAt={pendingDueAt} />
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        {items.map((it) => (
          <StyleboardItemCard
            key={it.id}
            item={it}
            closetItems={closetItems}
            inspiration={inspiration}
          />
        ))}
      </div>

      {rating && (
        <p className="text-sm text-muted-foreground">
          You already reacted: <strong>{rating}</strong>
        </p>
      )}

      {canRate && !showRevise && !notMyStyle && (
        <div className="flex flex-wrap gap-3">
          <button
            disabled={pending}
            onClick={() => submit("LOVE")}
            className="rounded-full bg-foreground px-6 py-2 text-sm text-background disabled:opacity-50"
          >
            Love it
          </button>
          <button
            disabled={pending}
            onClick={() => setShowRevise(true)}
            className="rounded-full border px-6 py-2 text-sm hover:bg-foreground hover:text-background"
          >
            Revise
          </button>
          <button
            disabled={pending}
            onClick={() => setNotMyStyle(true)}
            className="rounded-full border px-6 py-2 text-sm hover:bg-foreground hover:text-background"
          >
            Not my style
          </button>
        </div>
      )}

      {canRate && showRevise && (
        <ReviseModal
          items={items}
          closetItems={closetItems}
          inspiration={inspiration}
          itemFeedback={itemFeedback}
          toggleReason={toggleReason}
          setItemNote={setItemNote}
          onCancel={() => setShowRevise(false)}
          onSubmit={() => submit("REVISE")}
          pending={pending}
        />
      )}

      {canRate && notMyStyle && (
        <div className="max-w-xl">
          <p className="mb-2 text-sm">Tell your stylist what felt off:</p>
          <textarea
            value={boardFeedback}
            onChange={(e) => setBoardFeedback(e.target.value)}
            className="mb-3 w-full rounded border p-2 text-sm"
            rows={4}
          />
          <div className="flex gap-3">
            <button
              disabled={pending}
              onClick={() => submit("NOT_MY_STYLE")}
              className="rounded-full bg-foreground px-6 py-2 text-sm text-background disabled:opacity-50"
            >
              Send feedback
            </button>
            <button
              disabled={pending}
              onClick={() => setNotMyStyle(false)}
              className="rounded-full border px-6 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </>
  );
}

function StyleboardItemCard({
  item,
  closetItems,
  inspiration,
}: {
  item: BoardItem;
  closetItems: ClosetItem[];
  inspiration: InspirationPhoto[];
}) {
  const [inventoryMeta, setInventoryMeta] = useState<{
    url: string | null;
    name: string | null;
    brand: string | null;
    price: number | null;
  } | null>(null);

  useEffect(() => {
    if (item.source !== "INVENTORY" || !item.inventoryProductId) return;
    let active = true;
    void fetch(`/api/products/${item.inventoryProductId}`)
      .then(async (res) => (res.ok ? res.json() : null))
      .then((doc) => {
        if (!active || !doc) return;
        setInventoryMeta({
          url: (doc.primary_image_url as string | null) ?? null,
          name: (doc.canonical_name as string | null) ?? null,
          brand: (doc.brand_name as string | null) ?? null,
          price: typeof doc.min_price === "number" ? doc.min_price : null,
        });
      });
    return () => {
      active = false;
    };
  }, [item.source, item.inventoryProductId]);

  let url: string | null = null;
  let title: string | null = null;
  let brand: string | null = null;

  if (item.source === "CLOSET") {
    const c = closetItems.find((x) => x.id === item.closetItemId);
    url = c?.url ?? null;
    title = c?.name ?? null;
    brand = c?.designer ?? null;
  } else if (item.source === "INSPIRATION_PHOTO") {
    const i = inspiration.find((x) => x.id === item.inspirationPhotoId);
    url = i?.url ?? null;
    title = i?.title ?? null;
  } else if (item.source === "WEB_ADDED") {
    url = item.webItemImageUrl ?? null;
    title = item.webItemTitle ?? item.webItemUrl ?? null;
    brand = item.webItemBrand ?? null;
  } else if (item.source === "INVENTORY") {
    url = inventoryMeta?.url ?? null;
    title = inventoryMeta?.name ?? null;
    brand = inventoryMeta?.brand ?? null;
  }

  return (
    <div className="overflow-hidden rounded border">
      {url ? (
        <img src={url} alt={title ?? ""} className="aspect-square w-full object-cover" />
      ) : (
        <div className="flex aspect-square items-center justify-center bg-muted text-xs text-muted-foreground">
          Loading…
        </div>
      )}
      <div className="p-2">
        {brand && <p className="truncate text-xs">{brand}</p>}
        {title && <p className="truncate text-xs text-muted-foreground">{title}</p>}
      </div>
    </div>
  );
}

function ReviseModal({
  items,
  closetItems,
  inspiration,
  itemFeedback,
  toggleReason,
  setItemNote,
  onCancel,
  onSubmit,
  pending,
}: {
  items: BoardItem[];
  closetItems: ClosetItem[];
  inspiration: InspirationPhoto[];
  itemFeedback: Record<string, { reasons: string[]; note: string }>;
  toggleReason: (itemId: string, reason: string) => void;
  setItemNote: (itemId: string, note: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  const anyFeedback = Object.values(itemFeedback).some(
    (v) => v.reasons.length > 0 || v.note.length > 0,
  );
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Pick the items you want changed and share why — your stylist will send a
        revised look.
      </p>
      {items.map((item) => {
        const state = itemFeedback[item.id] ?? { reasons: [], note: "" };
        return (
          <div key={item.id} className="rounded border p-3">
            <div className="mb-3 flex gap-3">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded bg-muted">
                <StyleboardItemCard
                  item={item}
                  closetItems={closetItems}
                  inspiration={inspiration}
                />
              </div>
              <div className="flex-1">
                <div className="mb-2 flex flex-wrap gap-1">
                  {SUGGESTED_FEEDBACK.map((reason) => {
                    const active = state.reasons.includes(reason);
                    return (
                      <button
                        key={reason}
                        onClick={() => toggleReason(item.id, reason)}
                        className={`rounded-full border px-3 py-1 text-xs ${
                          active ? "bg-foreground text-background" : ""
                        }`}
                      >
                        {reason}
                      </button>
                    );
                  })}
                </div>
                <textarea
                  placeholder="Add a note (optional)"
                  value={state.note}
                  onChange={(e) => setItemNote(item.id, e.target.value)}
                  className="w-full rounded border p-2 text-sm"
                  rows={2}
                />
              </div>
            </div>
          </div>
        );
      })}
      <div className="flex gap-3">
        <button
          disabled={pending || !anyFeedback}
          onClick={onSubmit}
          className="rounded-full bg-foreground px-6 py-2 text-sm text-background disabled:opacity-50"
        >
          {pending ? "Submitting…" : "Send revise request"}
        </button>
        <button
          disabled={pending}
          onClick={onCancel}
          className="rounded-full border px-6 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
