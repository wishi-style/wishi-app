"use client";

// Profile-mode shell around MoodboardBuilder. Pipes photo add/remove to the
// shared /api/moodboards/[id]/photos endpoint (which now allows sessionless
// boards owned by the stylist). The save dialog (title/description/tags) is
// owned by MoodboardBuilder in profileMode; this shell only forwards the
// publish payload to /api/profile-boards/[id]/publish.

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoodboardBuilder } from "@/app/(stylist)/stylist/sessions/[id]/moodboards/new/builder";

interface Props {
  boardId: string;
  initialStyle: string | null;
  initialImages: string[];
  initialPhotoIds: Record<string, string>;
}

export function ProfileMoodboardBuilderShell({
  boardId,
  initialStyle,
  initialImages,
  initialPhotoIds,
}: Props) {
  const router = useRouter();
  const photoIdsRef = useRef<Record<string, string>>({ ...initialPhotoIds });

  const onPhotoAdded = async (input: {
    url: string;
    s3Key: string;
    inspirationPhotoId: string;
  }): Promise<boolean> => {
    if (photoIdsRef.current[input.url]) return true;
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

  const back = () => router.push("/stylist/profile/boards");

  async function onProfileSave({
    images,
    title,
    description,
    tags,
  }: {
    images: string[];
    title: string;
    description: string;
    tags: string[];
  }) {
    const coverUrl = images[0] ?? null;
    const res = await fetch(`/api/profile-boards/${boardId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileStyle: initialStyle ?? null,
        coverUrl,
        title,
        description,
        tags,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error || "Publish failed");
      throw new Error(body.error || "Publish failed");
    }
    toast.success("Added to your profile");
    router.push(
      `/stylist/profile/boards?style=${encodeURIComponent(initialStyle ?? "")}`,
    );
    router.refresh();
  }

  return (
    <MoodboardBuilder
      clientName="your profile"
      sessionId={null}
      clientId={null}
      initialImages={initialImages}
      onBack={back}
      onPhotoAdded={onPhotoAdded}
      onPhotoRemoved={onPhotoRemoved}
      profileMode
      profileStyle={initialStyle}
      onProfileSave={onProfileSave}
    />
  );
}
