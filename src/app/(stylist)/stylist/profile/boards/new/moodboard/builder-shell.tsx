"use client";

// Profile-mode shell around MoodboardBuilder. Pipes photo add/remove to the
// shared /api/moodboards/[id]/photos endpoint (which now allows sessionless
// boards owned by the stylist) and routes the save action through the
// sessionless publish endpoint instead of /api/moodboards/[id]/send.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoodboardBuilder } from "@/app/(stylist)/stylist/sessions/[id]/moodboards/new/builder";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FeatureOnProfile } from "@/components/stylist/feature-on-profile";

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

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [profileStyle, setProfileStyle] = useState(initialStyle ?? "");
  const [publishing, setPublishing] = useState(false);
  const [pendingImages, setPendingImages] = useState<string[]>([]);

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

  async function publish() {
    if (!profileStyle.trim()) {
      toast.error("Pick a style label before publishing");
      return;
    }
    setPublishing(true);
    try {
      const coverUrl = pendingImages[0] ?? initialImages[0] ?? null;
      const res = await fetch(`/api/profile-boards/${boardId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileStyle: profileStyle.trim(),
          coverUrl,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || "Publish failed");
        return;
      }
      toast.success("Added to your profile");
      router.push(
        `/stylist/profile/boards?style=${encodeURIComponent(profileStyle.trim())}`,
      );
      router.refresh();
    } finally {
      setPublishing(false);
    }
  }

  return (
    <>
      <MoodboardBuilder
        clientName="your profile"
        sessionId={null}
        clientId={null}
        initialImages={initialImages}
        onBack={back}
        onPhotoAdded={onPhotoAdded}
        onPhotoRemoved={onPhotoRemoved}
        onSend={(images) => {
          setPendingImages(images);
          setConfirmOpen(true);
        }}
      />

      <Dialog open={confirmOpen} onOpenChange={(o) => !publishing && setConfirmOpen(o)}>
        <DialogContent className="sm:max-w-md rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">
              Publish moodboard
            </DialogTitle>
            <DialogDescription className="font-body text-sm text-muted-foreground">
              This will appear on your public stylist profile under the chosen style.
            </DialogDescription>
          </DialogHeader>
          <FeatureOnProfile
            alwaysOn
            enabled
            onEnabledChange={() => {}}
            style={profileStyle}
            onStyleChange={setProfileStyle}
            disabled={publishing}
          />
          <DialogFooter className="gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmOpen(false)}
              disabled={publishing}
              className="font-body text-xs h-8 rounded-sm"
            >
              Keep editing
            </Button>
            <Button
              onClick={publish}
              disabled={publishing || !profileStyle.trim()}
              size="sm"
              className="h-8 rounded-sm bg-foreground text-background hover:bg-foreground/90 font-body text-xs"
            >
              {publishing ? "Publishing…" : "Publish to profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
