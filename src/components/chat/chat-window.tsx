"use client";

import { useCallback, useRef } from "react";
import Link from "next/link";
import { useChat } from "./use-chat";
import { ChatHeader } from "./chat-header";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { useDictation } from "./use-dictation";

import type { ViewerRole } from "./message-renderers";

interface ChatWindowProps {
  sessionId: string;
  currentIdentity: string;
  otherUserName: string;
  otherUserAvatar?: string | null;
  sessionStatus: string;
  viewerRole: ViewerRole;
  /** Optional override for the chat header (e.g. when the host shell already
   *  surfaces the participant in its own left rail and the inline header would
   *  be redundant). */
  hideHeader?: boolean;
  /** Optional callback for the "Inspiration library" item in the attach
   *  Popover. When omitted the option is hidden. */
  onInspirationLibrary?: () => void;
}

/** Session statuses where the chat is read-only. The composer is replaced by
 *  the Loveable "This session has ended. Book a new session" link. */
const CLOSED_STATUSES = new Set([
  "ENDED",
  "CLOSED",
  "EXPIRED",
  "REFUNDED",
  "CANCELLED",
  "CANCELED",
  "COMPLETED",
]);

export function ChatWindow({
  sessionId,
  currentIdentity,
  otherUserName,
  otherUserAvatar,
  sessionStatus,
  viewerRole,
  hideHeader,
  onInspirationLibrary,
}: ChatWindowProps) {
  const {
    messages,
    sendTextMessage,
    sendMediaMessage,
    isConnected,
    isLoading,
    error,
  } = useChat(sessionId);

  const dictation = useDictation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleSendText = useCallback(
    (text: string) => {
      sendTextMessage(text);
    },
    [sendTextMessage],
  );

  const handleAttachFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleCameraCapture = useCallback(() => {
    cameraInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const res = await fetch(
          `/api/chat/media?sessionId=${sessionId}&filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type)}`,
        );
        if (!res.ok) throw new Error("Failed to get upload URL");
        const { uploadUrl, publicUrl, key } = await res.json();

        await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });

        await sendMediaMessage(publicUrl, "PHOTO", { mediaS3Key: key });
      } catch (err) {
        console.error("[chat] File upload failed:", err);
      }

      if (e.target) e.target.value = "";
    },
    [sessionId, sendMediaMessage],
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Connecting to chat…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Unable to connect to chat</p>
          <p className="mt-1 text-xs text-muted-foreground/70">{error}</p>
        </div>
      </div>
    );
  }

  const isClosed = CLOSED_STATUSES.has(sessionStatus.toUpperCase());
  const recipientFirstName = otherUserName.split(" ").filter(Boolean)[0] ?? null;
  // Clients book a new session through their sessions list; stylists return to
  // their dashboard.
  const closedSessionHref =
    viewerRole === "CLIENT" ? "/sessions" : "/stylist/dashboard";

  return (
    <div className="flex h-full flex-col bg-background">
      {!hideHeader && (
        <ChatHeader
          otherUserName={otherUserName}
          otherUserAvatar={otherUserAvatar}
          sessionStatus={sessionStatus}
        />
      )}

      {!isConnected && !isClosed && (
        <div className="bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-700">
          Reconnecting…
        </div>
      )}

      <MessageList
        messages={messages}
        currentIdentity={currentIdentity}
        sessionId={sessionId}
        viewerRole={viewerRole}
      />

      {isClosed ? (
        <div className="border-t border-border py-6 text-center">
          <p className="text-sm text-muted-foreground">
            This session has ended.{" "}
            <Link
              href={closedSessionHref}
              className="text-accent underline underline-offset-4 hover:text-accent/80"
            >
              Book a new session
            </Link>
          </p>
        </div>
      ) : (
        <ChatInput
          onSendText={handleSendText}
          onAttachFile={handleAttachFile}
          onCameraCapture={handleCameraCapture}
          onInspirationLibrary={onInspirationLibrary}
          recipientFirstName={recipientFirstName}
          disabled={!isConnected}
          dictation={dictation}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,.pdf,.doc,.docx"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
