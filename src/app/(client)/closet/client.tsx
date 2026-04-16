"use client";

import { useState } from "react";
import type { ClosetItem } from "@/generated/prisma/client";

interface Props {
  initialItems: ClosetItem[];
}

export function ClosetPageClient({ initialItems }: Props) {
  const [items, setItems] = useState(initialItems);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [designer, setDesigner] = useState("");
  const [category, setCategory] = useState("");

  async function upload(file: File) {
    setErr(null);
    setUploading(true);
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
        body: JSON.stringify({
          s3Key: key,
          url: publicUrl,
          name: name || undefined,
          designer: designer || undefined,
          category: category || undefined,
        }),
      });
      if (!created.ok) throw new Error("create failed");
      const item = (await created.json()) as ClosetItem;
      setItems((prev) => [item, ...prev]);
      setName("");
      setDesigner("");
      setCategory("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function del(id: string) {
    if (!confirm("Remove this item?")) return;
    const res = await fetch(`/api/closet/${id}`, { method: "DELETE" });
    if (res.ok) setItems((p) => p.filter((i) => i.id !== id));
  }

  return (
    <>
      <div className="mb-8 rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-medium">Add Item</h2>
        <div className="mb-3 grid gap-2 md:grid-cols-3">
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder="Designer / Brand"
            value={designer}
            onChange={(e) => setDesigner(e.target.value)}
          />
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder="Category (e.g. Tops)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </div>
        <div className="flex gap-3">
          <label className="cursor-pointer rounded-full border px-4 py-2 text-sm hover:bg-foreground hover:text-background">
            Take a Photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
          </label>
          <label className="cursor-pointer rounded-full border px-4 py-2 text-sm hover:bg-foreground hover:text-background">
            Photo Library
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
          </label>
        </div>
        {uploading && <p className="mt-2 text-sm text-muted-foreground">Uploading…</p>}
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
        {items.map((item) => (
          <div key={item.id} className="group relative overflow-hidden rounded-lg border">
            <img src={item.url} alt={item.name ?? ""} className="aspect-square w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100">
              <p className="truncate text-xs text-white">{item.name ?? item.designer ?? "Item"}</p>
              <button
                onClick={() => void del(item.id)}
                className="mt-1 text-xs text-red-300 hover:text-red-100"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">
            Your closet is empty. Add an item to get started.
          </p>
        )}
      </div>
    </>
  );
}
