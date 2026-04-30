"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoodboardBuilder } from "./builder";

interface Props {
  boardId: string;
  sessionId: string;
  clientName: string;
  initialImages: string[];
}

export function MoodboardBuilderShell({ boardId, sessionId, clientName, initialImages }: Props) {
  const router = useRouter();
  const back = () => router.push(`/stylist/dashboard?session=${sessionId}`);
  return (
    <MoodboardBuilder
      clientName={clientName}
      sessionId={sessionId}
      initialImages={initialImages}
      onBack={back}
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
