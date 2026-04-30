"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoodboardBuilder } from "./builder";

interface Props {
  boardId: string;
  sessionId: string;
  clientName: string;
  initialImages: string[];
  initialPhotoIds: Record<string, string>;
}

export function MoodboardBuilderShell({
  boardId,
  sessionId,
  clientName,
  initialImages,
  initialPhotoIds,
}: Props) {
  const router = useRouter();
  const back = () => router.push(`/stylist/dashboard?session=${sessionId}`);

  // url → photo.id map; mutated as photos are added/removed.
  const photoIdsRef = useRef<Record<string, string>>({ ...initialPhotoIds });

  const onPhotoAdded = async (input: {
    url: string;
    s3Key: string;
    inspirationPhotoId: string;
  }): Promise<boolean> => {
    if (photoIdsRef.current[input.url]) return true; // already persisted
    const res = await fetch(`/api/moodboards/${boardId}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        s3Key: input.s3Key,
        url: input.url,
        inspirationPhotoId: input.inspirationPhotoId,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error || "Couldn't add photo");
      return false;
    }
    const photo = await res.json();
    photoIdsRef.current[input.url] = photo.id;
    return true;
  };

  const onPhotoRemoved = async (url: string): Promise<void> => {
    const photoId = photoIdsRef.current[url];
    if (!photoId) return;
    const res = await fetch(
      `/api/moodboards/${boardId}/photos/${photoId}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      toast.error("Couldn't remove photo");
      return;
    }
    delete photoIdsRef.current[url];
  };

  return (
    <MoodboardBuilder
      clientName={clientName}
      sessionId={sessionId}
      initialImages={initialImages}
      onBack={back}
      onPhotoAdded={onPhotoAdded}
      onPhotoRemoved={onPhotoRemoved}
      onSend={async (_images, note) => {
        const res = await fetch(`/api/moodboards/${boardId}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note }),
        });
        if (!res.ok) {
          toast.error("Couldn't send moodboard");
          return;
        }
        back();
      }}
    />
  );
}
