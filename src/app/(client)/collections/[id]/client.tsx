"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CollectionDetail } from "@/lib/collections/collection.service";

interface Props {
  collection: CollectionDetail;
}

export function CollectionDetailClient({ collection: initial }: Props) {
  const router = useRouter();
  const [collection, setCollection] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initial.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveName() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/collections/${collection.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Failed to rename");
        return;
      }
      // Use the server's normalized name (trim + validation) so what we
      // display matches what was actually persisted.
      const updated = (await res.json()) as { name: string; updatedAt: string };
      setCollection({ ...collection, name: updated.name });
      setName(updated.name);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(closetItemId: string) {
    const prev = collection.items;
    setCollection({
      ...collection,
      items: prev.filter((it) => it.closetItem.id !== closetItemId),
    });
    const res = await fetch(
      `/api/collections/${collection.id}/items?closetItemId=${encodeURIComponent(closetItemId)}`,
      { method: "DELETE" },
    );
    if (!res.ok) setCollection({ ...collection, items: prev });
  }

  async function deleteCollection() {
    if (!confirm(`Delete "${collection.name}"? Items in your closet stay.`)) return;
    setBusy(true);
    const res = await fetch(`/api/collections/${collection.id}`, {
      method: "DELETE",
    });
    if (res.ok) router.push("/profile");
    else setBusy(false);
  }

  return (
    <>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div className="flex-1">
          {editing ? (
            <div className="flex items-center gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="max-w-md font-display text-2xl"
                maxLength={80}
              />
              <Button size="sm" onClick={saveName} disabled={busy}>
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setName(collection.name);
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <h1 className="font-display text-3xl text-foreground">
                {collection.name}
              </h1>
              <button
                onClick={() => setEditing(true)}
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Rename"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          )}
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          <p className="mt-1 text-sm text-muted-foreground">
            {collection.items.length}{" "}
            {collection.items.length === 1 ? "item" : "items"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={deleteCollection}
          disabled={busy}
          className="gap-1.5 text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      </div>

      {collection.items.length === 0 ? (
        <p className="py-20 text-center text-sm text-muted-foreground">
          This collection is empty. Add items from your closet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
          {collection.items.map((it) => (
            <div
              key={it.id}
              className="group relative overflow-hidden rounded-xl border border-border bg-card"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={it.closetItem.url}
                alt={it.closetItem.name ?? ""}
                className="aspect-square w-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeItem(it.closetItem.id)}
                aria-label="Remove from collection"
                className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 backdrop-blur transition-opacity hover:text-destructive group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="p-2">
                <p className="truncate text-xs font-medium text-foreground">
                  {it.closetItem.designer ?? ""}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {it.closetItem.name ?? it.closetItem.category ?? ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
