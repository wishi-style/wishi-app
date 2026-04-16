"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  BoardItem,
  ClosetItem,
  InspirationPhoto,
} from "@/generated/prisma/client";
import type { ProductSearchDoc, SearchResponse } from "@/lib/inventory/types";

type Tab = "inventory" | "closet" | "inspiration" | "web";

interface Props {
  boardId: string;
  sessionId: string;
  isRevision: boolean;
  initialItems: BoardItem[];
  closetItems: ClosetItem[];
  inspiration: InspirationPhoto[];
}

export function StyleboardBuilder({
  boardId,
  sessionId,
  isRevision,
  initialItems,
  closetItems,
  inspiration,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [tab, setTab] = useState<Tab>("inventory");
  const [search, setSearch] = useState("");
  const [inventoryResults, setInventoryResults] = useState<ProductSearchDoc[]>([]);
  const [webUrl, setWebUrl] = useState("");
  const [sending, startSending] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function runInventorySearch() {
    setError(null);
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    params.set("inStockOnly", "true");
    params.set("pageSize", "24");
    const res = await fetch(`/api/products?${params.toString()}`);
    if (!res.ok) {
      setError("Inventory search failed");
      setInventoryResults([]);
      return;
    }
    const data = (await res.json()) as SearchResponse;
    setInventoryResults(data.results ?? []);
  }

  async function addItem(body: Record<string, unknown>) {
    const res = await fetch(`/api/styleboards/${boardId}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      setError(b.error ?? "Add failed");
      return;
    }
    const item = (await res.json()) as BoardItem;
    setItems((p) => [...p, item]);
  }

  async function remove(itemId: string) {
    const res = await fetch(`/api/styleboards/${boardId}/items/${itemId}`, {
      method: "DELETE",
    });
    if (res.ok) setItems((p) => p.filter((i) => i.id !== itemId));
  }

  async function addWebItem() {
    if (!webUrl) return;
    await addItem({ source: "WEB_ADDED", webItemUrl: webUrl });
    setWebUrl("");
  }

  function send() {
    setError(null);
    startSending(async () => {
      const res = await fetch(`/api/styleboards/${boardId}/send`, {
        method: "POST",
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? "Send failed");
        return;
      }
      router.push(`/stylist/sessions/${sessionId}/workspace`);
      router.refresh();
    });
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "inventory", label: "Inventory" },
    { id: "closet", label: "Closet" },
    { id: "inspiration", label: "Inspiration" },
    { id: "web", label: "Web URL" },
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_2fr]">
      <section>
        <h2 className="mb-3 text-sm font-medium">
          Your board ({items.length} {items.length === 1 ? "item" : "items"})
        </h2>
        <div className="mb-4 grid grid-cols-3 gap-2">
          {items.map((it) => (
            <div key={it.id} className="group relative aspect-square overflow-hidden rounded border">
              <BoardItemThumb item={it} closetItems={closetItems} inspiration={inspiration} />
              <button
                onClick={() => void remove(it.id)}
                className="absolute right-1 top-1 rounded bg-black/70 px-2 py-0.5 text-xs text-white opacity-0 group-hover:opacity-100"
              >
                Remove
              </button>
            </div>
          ))}
          {items.length === 0 && (
            <p className="col-span-3 text-sm text-muted-foreground">
              Empty. Add items from the right.
            </p>
          )}
        </div>
        <button
          onClick={send}
          disabled={items.length === 0 || sending}
          className="rounded-full bg-foreground px-6 py-2 text-sm text-background disabled:opacity-50"
        >
          {sending ? "Sending…" : `Send ${isRevision ? "Restyle" : "Styleboard"}`}
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>

      <section>
        <div className="mb-4 flex gap-2 border-b">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-sm ${
                tab === t.id ? "border-b-2 border-foreground" : "text-muted-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "inventory" && (
          <>
            <div className="mb-3 flex gap-2">
              <input
                className="flex-1 rounded border px-3 py-2 text-sm"
                placeholder="Search products…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runInventorySearch();
                }}
              />
              <button
                onClick={() => void runInventorySearch()}
                className="rounded border px-4 py-2 text-sm"
              >
                Search
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 lg:grid-cols-4">
              {inventoryResults.map((p) => (
                <button
                  key={p.id}
                  onClick={() =>
                    void addItem({ source: "INVENTORY", inventoryProductId: p.id })
                  }
                  className="overflow-hidden rounded border text-left hover:opacity-80"
                >
                  <img
                    src={p.primary_image_url ?? ""}
                    alt={p.canonical_name}
                    className="aspect-square w-full object-cover"
                  />
                  <div className="p-2">
                    <p className="truncate text-xs">{p.brand_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.canonical_name}</p>
                  </div>
                </button>
              ))}
              {inventoryResults.length === 0 && (
                <p className="col-span-full text-sm text-muted-foreground">
                  No results yet — run a search.
                </p>
              )}
            </div>
          </>
        )}

        {tab === "closet" && (
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-4">
            {closetItems.map((c) => (
              <button
                key={c.id}
                onClick={() => void addItem({ source: "CLOSET", closetItemId: c.id })}
                className="overflow-hidden rounded border hover:opacity-80"
              >
                <img src={c.url} alt={c.name ?? ""} className="aspect-square w-full object-cover" />
              </button>
            ))}
            {closetItems.length === 0 && (
              <p className="col-span-full text-sm text-muted-foreground">
                Client&apos;s closet is empty.
              </p>
            )}
          </div>
        )}

        {tab === "inspiration" && (
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-4">
            {inspiration.map((i) => (
              <button
                key={i.id}
                onClick={() =>
                  void addItem({ source: "INSPIRATION_PHOTO", inspirationPhotoId: i.id })
                }
                className="overflow-hidden rounded border hover:opacity-80"
              >
                <img src={i.url} alt={i.title ?? ""} className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {tab === "web" && (
          <div className="flex max-w-xl gap-2">
            <input
              className="flex-1 rounded border px-3 py-2 text-sm"
              placeholder="https://…"
              value={webUrl}
              onChange={(e) => setWebUrl(e.target.value)}
            />
            <button onClick={() => void addWebItem()} className="rounded border px-4 py-2 text-sm">
              Add
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function BoardItemThumb({
  item,
  closetItems,
  inspiration,
}: {
  item: BoardItem;
  closetItems: ClosetItem[];
  inspiration: InspirationPhoto[];
}) {
  let url: string | null = null;
  let label: string | null = null;
  if (item.source === "CLOSET") {
    const c = closetItems.find((x) => x.id === item.closetItemId);
    url = c?.url ?? null;
    label = c?.name ?? c?.designer ?? null;
  } else if (item.source === "INSPIRATION_PHOTO") {
    const i = inspiration.find((x) => x.id === item.inspirationPhotoId);
    url = i?.url ?? null;
    label = i?.title ?? null;
  } else if (item.source === "WEB_ADDED") {
    url = item.webItemImageUrl ?? null;
    label = item.webItemTitle ?? item.webItemUrl ?? null;
  } else if (item.source === "INVENTORY") {
    // Inventory items don't carry a cached image — fetched on demand by the
    // viewer. For the builder thumbnail, show a placeholder tile.
    label = item.inventoryProductId ?? "Inventory item";
  }
  return url ? (
    <img src={url} alt={label ?? ""} className="h-full w-full object-cover" />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-muted p-2 text-center text-[10px] text-muted-foreground">
      {label}
    </div>
  );
}
