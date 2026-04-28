"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Camera,
  Image as ImageIcon,
  Globe,
  Trash2,
  ChevronRight,
} from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ClosetItem } from "@/generated/prisma/client";
import type { CollectionWithPreview } from "@/lib/collections/collection.service";
import {
  computeClosetFacets,
  filterClosetItems,
  type ClosetFilterKey as FilterKey,
  type ClosetFilters,
} from "@/lib/closet/filter";

interface Look {
  id: string;
  boardId: string;
  sessionId: string | null;
  title: string | null;
}

interface Props {
  initialItems: ClosetItem[];
  looks: Look[];
  collections: CollectionWithPreview[];
}

const FILTER_LABELS: Record<FilterKey, string> = {
  designer: "Designer",
  season: "Season",
  color: "Color",
  category: "Category",
};

export function ProfilePageClient({
  initialItems,
  looks,
  collections: initialCollections,
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [collections, setCollections] = useState(initialCollections);
  const [filters, setFilters] = useState<ClosetFilters>({});
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const facets = useMemo(() => computeClosetFacets(items), [items]);
  const filteredItems = useMemo(
    () => filterClosetItems(items, filters),
    [items, filters],
  );

  function setFilter(key: FilterKey, value: string | null) {
    setFilters((prev) => {
      const next = { ...prev };
      if (value == null) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  async function deleteItem(id: string) {
    if (!confirm("Remove this item from your closet?")) return;
    const res = await fetch(`/api/closet/${id}`, { method: "DELETE" });
    if (res.ok) setItems((p) => p.filter((i) => i.id !== id));
  }

  function handleItemAdded(item: ClosetItem) {
    setItems((p) => [item, ...p]);
    setAddOpen(false);
  }

  async function createCollection(name: string): Promise<void> {
    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Couldn't create collection");
    }
    const created = (await res.json()) as { id: string; name: string };
    setCollections((p) => [
      {
        id: created.id,
        name: created.name,
        coverImageUrl: null,
        itemCount: 0,
        previewImages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      ...p,
    ]);
  }

  return (
    <>
      <Tabs defaultValue="items" className="w-full">
        <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b border-stone-200 bg-transparent p-0">
          <TabsTrigger
            value="items"
            className="rounded-none border-b-2 border-transparent px-0 pb-3 text-base data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Items
          </TabsTrigger>
          <TabsTrigger
            value="looks"
            className="rounded-none border-b-2 border-transparent px-0 pb-3 text-base data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Looks
          </TabsTrigger>
          <TabsTrigger
            value="collections"
            className="rounded-none border-b-2 border-transparent px-0 pb-3 text-base data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Collections
          </TabsTrigger>
        </TabsList>

        {/* Items tab — sidebar filters + grid + add dialog */}
        <TabsContent value="items" className="mt-6">
          <div className="flex gap-8">
            {/* Filter sidebar */}
            <aside className="hidden w-52 shrink-0 lg:block">
              <h3 className="mb-4 font-serif text-lg">Filter</h3>
              {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => {
                const values = facets[key];
                const selected = filters[key];
                const isOpen = openFilter === key;
                return (
                  <div key={key} className="border-b border-stone-200">
                    <button
                      type="button"
                      onClick={() => setOpenFilter(isOpen ? null : key)}
                      className="flex w-full items-center justify-between py-3 text-left text-sm text-stone-800 hover:text-stone-500"
                    >
                      <span>
                        {FILTER_LABELS[key]}
                        {selected && (
                          <span className="ml-2 text-xs text-stone-500">
                            · {selected}
                          </span>
                        )}
                      </span>
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 text-stone-400 transition-transform",
                          isOpen && "rotate-90",
                        )}
                      />
                    </button>
                    {isOpen && (
                      <div className="pb-3">
                        {values.length === 0 ? (
                          <p className="text-xs text-stone-400">None yet</p>
                        ) : (
                          <ul className="space-y-1">
                            <li>
                              <button
                                type="button"
                                onClick={() => setFilter(key, null)}
                                className={cn(
                                  "block w-full rounded px-2 py-1 text-left text-xs hover:bg-stone-50",
                                  !selected && "font-medium text-stone-900",
                                )}
                              >
                                All
                              </button>
                            </li>
                            {values.map((v) => (
                              <li key={v}>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setFilter(key, selected === v ? null : v)
                                  }
                                  className={cn(
                                    "block w-full rounded px-2 py-1 text-left text-xs capitalize hover:bg-stone-50",
                                    selected === v && "bg-stone-100 font-medium",
                                  )}
                                >
                                  {v}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </aside>

            <div className="min-w-0 flex-1">
              <div className="mb-5 flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-stone-500">
                  {filteredItems.length}{" "}
                  {filteredItems.length === 1 ? "item" : "items"}
                </p>
                <Button
                  size="sm"
                  className="rounded-full"
                  onClick={() => setAddOpen(true)}
                >
                  <Plus className="h-4 w-4" /> Add Item
                </Button>
              </div>

              {filteredItems.length === 0 ? (
                <p className="py-16 text-center text-sm text-stone-500">
                  {items.length === 0
                    ? "Your closet is empty. Add an item to get started."
                    : "No items match the current filters."}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {filteredItems.map((item) => (
                    <div
                      key={item.id}
                      className="group relative overflow-hidden rounded-xl border border-stone-200 bg-white"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.url}
                        alt={item.name ?? ""}
                        className="aspect-square w-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <p className="truncate text-xs text-white">
                          {item.designer ?? item.name ?? "Item"}
                        </p>
                        <button
                          onClick={() => void deleteItem(item.id)}
                          className="mt-1 inline-flex items-center gap-1 text-xs text-red-200 hover:text-red-100"
                        >
                          <Trash2 className="h-3 w-3" /> Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Looks tab — favorited styleboards */}
        <TabsContent value="looks" className="mt-6">
          {looks.length === 0 ? (
            <p className="py-20 text-center text-sm text-stone-500">
              No saved looks yet. Tap the heart on a styleboard to save it here.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {looks.map((look) => (
                <Link
                  key={look.id}
                  href={
                    look.sessionId
                      ? `/sessions/${look.sessionId}`
                      : `/profile`
                  }
                  className="group block overflow-hidden rounded-2xl border border-stone-200 bg-white transition-shadow hover:shadow-md"
                >
                  <div className="aspect-square bg-stone-100" />
                  <div className="p-3 text-sm text-stone-700">
                    {look.title ?? "Styleboard"}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Collections tab — preview grid + create */}
        <TabsContent value="collections" className="mt-6">
          <div className="mb-5 flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-stone-500">
              {collections.length}{" "}
              {collections.length === 1 ? "collection" : "collections"}
            </p>
            <CreateCollectionButton onCreate={createCollection} />
          </div>
          {collections.length === 0 ? (
            <p className="py-20 text-center text-sm text-stone-500">
              No collections yet. Create one to group items by occasion or season.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
              {collections.map((c) => (
                <Link
                  key={c.id}
                  href={`/collections/${c.id}`}
                  className="group block overflow-hidden rounded-2xl border border-stone-200 bg-white transition-shadow hover:shadow-md"
                >
                  <div className="grid grid-cols-2 gap-1.5 p-3 pb-0">
                    {Array.from({ length: 4 }).map((_, i) => {
                      const url = c.previewImages[i];
                      return (
                        <div
                          key={i}
                          className="aspect-square overflow-hidden rounded-lg bg-stone-100"
                        >
                          {url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={url}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-end justify-between p-4 pt-3">
                    <div>
                      <p className="font-serif text-base text-stone-900">
                        {c.name}
                      </p>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {c.itemCount} {c.itemCount === 1 ? "item" : "items"}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-stone-400 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AddItemDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onItemCreated={handleItemAdded}
      />
    </>
  );
}

interface AddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onItemCreated: (item: ClosetItem) => void;
}

function AddItemDialog({ open, onOpenChange, onItemCreated }: AddDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webUrl, setWebUrl] = useState("");

  async function uploadFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const presign = await fetch(
        `/api/closet?presign=1&filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type)}`,
        { method: "POST" },
      );
      if (!presign.ok) throw new Error("upload-url failed");
      const { uploadUrl, key, publicUrl } = (await presign.json()) as {
        uploadUrl: string;
        key: string;
        publicUrl: string;
      };
      const put = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type },
      });
      if (!put.ok) throw new Error("s3 put failed");
      const created = await fetch("/api/closet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ s3Key: key, url: publicUrl }),
      });
      if (!created.ok) throw new Error("create failed");
      onItemCreated((await created.json()) as ClosetItem);
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFromWeb() {
    if (!webUrl.trim()) {
      setError("Paste a product URL first");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/closet/from-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: webUrl.trim() }),
      });
      // The endpoint returns 202 with `partial: true` when the OG scrape only
      // captured some metadata — we still got an item, just incomplete.
      if (res.status !== 201 && res.status !== 202) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Couldn't add from web");
      }
      const body = (await res.json()) as {
        item: ClosetItem;
        partial?: boolean;
      };
      onItemCreated(body.item);
      setWebUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "URL upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Add Item</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <label className="flex w-full cursor-pointer items-center gap-4 rounded-xl border border-stone-200 p-4 hover:bg-stone-50">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-stone-100">
              <Camera className="h-5 w-5 text-stone-600" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium text-stone-800">
                Take a Photo
              </span>
              <span className="block text-xs text-stone-500">Use your camera</span>
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadFile(f);
              }}
            />
          </label>
          <label className="flex w-full cursor-pointer items-center gap-4 rounded-xl border border-stone-200 p-4 hover:bg-stone-50">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-stone-100">
              <ImageIcon className="h-5 w-5 text-stone-600" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium text-stone-800">
                Photo Library
              </span>
              <span className="block text-xs text-stone-500">
                Choose from your device
              </span>
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadFile(f);
              }}
            />
          </label>

          <div className="rounded-xl border border-stone-200 p-4">
            <div className="mb-3 flex items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-stone-100">
                <Globe className="h-5 w-5 text-stone-600" />
              </span>
              <div>
                <p className="text-sm font-medium text-stone-800">
                  Upload from Web
                </p>
                <p className="text-xs text-stone-500">
                  Paste a product link from any retailer
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Input
                type="url"
                value={webUrl}
                onChange={(e) => setWebUrl(e.target.value)}
                placeholder="https://…"
                disabled={busy}
              />
              <Button
                type="button"
                onClick={() => void uploadFromWeb()}
                disabled={busy}
              >
                Add
              </Button>
            </div>
          </div>

          {busy && <p className="text-sm text-stone-500">Working…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateCollectionButton({
  onCreate,
}: {
  onCreate: (name: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(name.trim());
      setOpen(false);
      setName("");
    } catch (e) {
      // Keep the dialog open so the user can correct + retry instead of
      // having state silently reset on a failed POST.
      setError(e instanceof Error ? e.message : "Couldn't create collection");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        className="rounded-full"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-4 w-4" /> New Collection
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">
              New Collection
            </DialogTitle>
          </DialogHeader>
        <div className="space-y-4 pt-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Spring Capsule"
            maxLength={80}
            autoFocus
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button
            className="w-full"
            onClick={submit}
            disabled={busy || !name.trim()}
          >
            {busy ? "Creating…" : "Create"}
          </Button>
        </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
