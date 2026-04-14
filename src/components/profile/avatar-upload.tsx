"use client";

import { useRef, useState } from "react";
import { confirmAvatarUpload } from "@/app/(client)/settings/actions";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export function AvatarUpload({ currentUrl }: { currentUrl: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      alert("Please upload a JPEG, PNG, or WebP image.");
      return;
    }

    if (file.size > MAX_SIZE) {
      alert("Image must be under 5MB.");
      return;
    }

    setUploading(true);

    try {
      // Show local preview immediately
      setPreview(URL.createObjectURL(file));

      // Get presigned URL from our API
      const params = new URLSearchParams({
        filename: file.name,
        contentType: file.type,
      });
      const res = await fetch(`/api/uploads/presigned?${params}`);
      if (!res.ok) throw new Error("Failed to get upload URL");

      const { url, key } = await res.json();

      // Upload directly to S3
      const uploadRes = await fetch(url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!uploadRes.ok) throw new Error("Upload failed");

      // Confirm upload — writes avatarUrl to DB
      await confirmAvatarUpload(key);
    } catch (err) {
      console.error("Avatar upload error:", err);
      setPreview(currentUrl);
      alert("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="relative h-20 w-20 overflow-hidden rounded-full bg-muted"
      >
        {preview ? (
          <img
            src={preview}
            alt="Avatar"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-2xl text-muted-foreground">
            ?
          </span>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="text-xs text-white">Uploading...</span>
          </div>
        )}
      </button>
      <div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "Change photo"}
        </button>
        <p className="text-xs text-muted-foreground">
          JPEG, PNG, or WebP. Max 5MB.
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
