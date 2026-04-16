"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  BoardPhoto,
  InspirationPhoto,
} from "@/generated/prisma/client";

interface Props {
  boardId: string;
  sessionId: string;
  initialPhotos: BoardPhoto[];
  inspiration: InspirationPhoto[];
}

export function MoodboardBuilder({
  boardId,
  sessionId,
  initialPhotos,
  inspiration,
}: Props) {
  const router = useRouter();
  const [photos, setPhotos] = useState(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [sending, startSending] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function addFromInspiration(photo: InspirationPhoto) {
    const res = await fetch(`/api/moodboards/${boardId}/photos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        s3Key: photo.s3Key,
        url: photo.url,
        inspirationPhotoId: photo.id,
      }),
    });
    if (res.ok) {
      const created = (await res.json()) as BoardPhoto;
      setPhotos((p) => [...p, created]);
    }
  }

  async function uploadCustom(file: File) {
    setError(null);
    setUploading(true);
    try {
      const presign = await fetch(
        `/api/moodboards/${boardId}/photos?presign=1&filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type)}`,
        { method: "POST" },
      );
      if (!presign.ok) throw new Error("presign failed");
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
      if (!put.ok) throw new Error("upload failed");
      const create = await fetch(`/api/moodboards/${boardId}/photos`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ s3Key: key, url: publicUrl }),
      });
      if (!create.ok) throw new Error("create failed");
      const created = (await create.json()) as BoardPhoto;
      setPhotos((p) => [...p, created]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
    } finally {
      setUploading(false);
    }
  }

  function send() {
    setError(null);
    startSending(async () => {
      const res = await fetch(`/api/moodboards/${boardId}/send`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Send failed");
        return;
      }
      router.push(`/stylist/sessions/${sessionId}/workspace`);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <section>
        <h2 className="mb-3 text-sm font-medium">Selected ({photos.length})</h2>
        <div className="mb-4 grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <img
              key={p.id}
              src={p.url}
              alt=""
              className="aspect-square rounded object-cover"
            />
          ))}
          {photos.length === 0 && (
            <p className="col-span-3 text-sm text-muted-foreground">Pick or upload photos.</p>
          )}
        </div>
        <label className="mb-3 inline-block cursor-pointer rounded-full border px-4 py-2 text-sm hover:bg-foreground hover:text-background">
          Upload custom photo
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadCustom(f);
            }}
          />
        </label>
        <div>
          <button
            onClick={send}
            disabled={photos.length === 0 || sending}
            className="rounded-full bg-foreground px-6 py-2 text-sm text-background disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send Moodboard"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium">Inspiration Library</h2>
        <div className="grid grid-cols-3 gap-2">
          {inspiration.map((p) => (
            <button
              key={p.id}
              onClick={() => void addFromInspiration(p)}
              className="aspect-square overflow-hidden rounded border hover:opacity-80"
            >
              <img src={p.url} alt={p.title ?? ""} className="h-full w-full object-cover" />
            </button>
          ))}
          {inspiration.length === 0 && (
            <p className="col-span-3 text-sm text-muted-foreground">
              No inspiration photos yet. Ask an admin to upload some.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
