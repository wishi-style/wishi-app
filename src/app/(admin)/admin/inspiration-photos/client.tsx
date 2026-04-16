"use client";

import { useState } from "react";
import type { InspirationPhoto } from "@/generated/prisma/client";

interface Props {
  initialPhotos: InspirationPhoto[];
}

export function InspirationLibraryClient({ initialPhotos }: Props) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const presignRes = await fetch(
        `/api/inspiration-photos?presign=1&filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type)}`,
        { method: "POST" },
      );
      if (!presignRes.ok) throw new Error("Failed to get upload URL");
      const { uploadUrl, key, publicUrl } = (await presignRes.json()) as {
        uploadUrl: string;
        key: string;
        publicUrl: string;
      };
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type },
      });
      if (!putRes.ok) throw new Error("S3 upload failed");

      const createRes = await fetch("/api/inspiration-photos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          s3Key: key,
          url: publicUrl,
          title: title || undefined,
          category: category || undefined,
          tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        }),
      });
      if (!createRes.ok) throw new Error("Create failed");
      const created = (await createRes.json()) as InspirationPhoto;
      setPhotos((prev) => [created, ...prev]);
      setTitle("");
      setCategory("");
      setTags("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function del(id: string) {
    if (!confirm("Delete this photo?")) return;
    const res = await fetch(`/api/inspiration-photos/${id}`, { method: "DELETE" });
    if (res.ok) setPhotos((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <>
      <div className="mb-8 rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-medium">Upload</h2>
        <div className="mb-3 grid gap-2 md:grid-cols-3">
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder="Category (e.g. streetwear)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder="Tags (comma-separated)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>
        <input
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        {uploading && <p className="mt-2 text-sm text-muted-foreground">Uploading…</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {photos.map((p) => (
          <div key={p.id} className="group relative overflow-hidden rounded-lg border">
            <img src={p.url} alt={p.title ?? ""} className="aspect-square w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100">
              <p className="truncate text-xs text-white">{p.title ?? "Untitled"}</p>
              <p className="truncate text-xs text-white/70">{p.category ?? ""}</p>
              <button
                onClick={() => void del(p.id)}
                className="mt-1 text-xs text-red-300 hover:text-red-100"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {photos.length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">No photos yet.</p>
        )}
      </div>
    </>
  );
}
