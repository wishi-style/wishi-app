"use client";

import { useState } from "react";
import type { InspirationPhoto } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Undo2 } from "lucide-react";

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
  const [editing, setEditing] = useState<InspirationPhoto | null>(null);

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
          tags: tags
            ? tags.split(",").map((t) => t.trim()).filter(Boolean)
            : [],
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

  async function deactivate(id: string) {
    if (!confirm("Deactivate this photo? It will be hidden from stylists."))
      return;
    const res = await fetch(`/api/inspiration-photos/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, deletedAt: new Date() } : p,
        ),
      );
    }
  }

  async function reactivate(id: string) {
    const res = await fetch(`/api/inspiration-photos/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reactivate: true }),
    });
    if (res.ok) {
      setPhotos((prev) =>
        prev.map((p) => (p.id === id ? { ...p, deletedAt: null } : p)),
      );
    }
  }

  async function saveEdit(patch: {
    title: string | null;
    category: string | null;
    tags: string[];
  }) {
    if (!editing) return;
    const res = await fetch(`/api/inspiration-photos/${editing.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = (await res.json()) as InspirationPhoto;
      setPhotos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setEditing(null);
    }
  }

  return (
    <>
      <div className="mb-6 rounded-lg border border-border p-4">
        <h2 className="mb-3 text-sm font-medium">Upload</h2>
        <div className="mb-3 grid gap-2 md:grid-cols-3">
          <Input
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Input
            placeholder="Category (e.g. streetwear)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <Input
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
        {uploading && (
          <p className="mt-2 text-sm text-muted-foreground">Uploading…</p>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {photos.map((p) => {
          const deactivated = Boolean(p.deletedAt);
          return (
            <div
              key={p.id}
              className={`group relative overflow-hidden rounded-lg border border-border ${
                deactivated ? "opacity-50" : ""
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.title ?? ""}
                className="aspect-square w-full object-cover"
              />
              {deactivated && (
                <div className="absolute left-2 top-2">
                  <Badge variant="outline">Deactivated</Badge>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                <p className="truncate text-xs text-white">
                  {p.title ?? "Untitled"}
                </p>
                {p.category && (
                  <p className="truncate text-xs text-white/70">{p.category}</p>
                )}
                <div className="mt-1 flex gap-2">
                  <button
                    onClick={() => setEditing(p)}
                    className="flex items-center gap-1 text-xs text-white/90 hover:text-white"
                    title="Edit"
                  >
                    <Pencil className="size-3" /> Edit
                  </button>
                  {deactivated ? (
                    <button
                      onClick={() => void reactivate(p.id)}
                      className="flex items-center gap-1 text-xs text-green-300 hover:text-green-100"
                      title="Reactivate"
                    >
                      <Undo2 className="size-3" /> Restore
                    </button>
                  ) : (
                    <button
                      onClick={() => void deactivate(p.id)}
                      className="flex items-center gap-1 text-xs text-red-300 hover:text-red-100"
                      title="Deactivate"
                    >
                      <Trash2 className="size-3" /> Deactivate
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {photos.length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">
            No photos yet.
          </p>
        )}
      </div>

      <EditDialog
        photo={editing}
        onClose={() => setEditing(null)}
        onSave={saveEdit}
      />
    </>
  );
}

function EditDialog({
  photo,
  onClose,
  onSave,
}: {
  photo: InspirationPhoto | null;
  onClose: () => void;
  onSave: (patch: {
    title: string | null;
    category: string | null;
    tags: string[];
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState(photo?.title ?? "");
  const [category, setCategory] = useState(photo?.category ?? "");
  const [tags, setTags] = useState(photo?.tags.join(", ") ?? "");
  const [saving, setSaving] = useState(false);

  if (!photo) return null;

  return (
    <Dialog
      open={Boolean(photo)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit photo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Category</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. streetwear"
            />
          </div>
          <div className="space-y-1">
            <Label>Tags</Label>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="comma,separated"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave({
                  title: title.trim() || null,
                  category: category.trim() || null,
                  tags: tags
                    ? tags.split(",").map((t) => t.trim()).filter(Boolean)
                    : [],
                });
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
