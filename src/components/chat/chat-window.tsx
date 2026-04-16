"use client";

import { useCallback, useRef } from "react";
import { useChat } from "./use-chat";
import { ChatHeader } from "./chat-header";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { useDictation } from "./use-dictation";

interface ChatWindowProps {
  sessionId: string;
  currentIdentity: string;
  otherUserName: string;
  otherUserAvatar?: string | null;
  sessionStatus: string;
}

export function ChatWindow({
  sessionId,
  currentIdentity,
  otherUserName,
  otherUserAvatar,
  sessionStatus,
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

  const handleSendText = useCallback(
    (text: string) => {
      sendTextMessage(text);
    },
    [sendTextMessage],
  );

  const handleAttachFile = useCallback(() => {
    fileInputRef.current?.click();
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

      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [sessionId, sendMediaMessage],
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#FAF8F5]">
        <p className="text-sm text-stone-400">Connecting to chat...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-[#FAF8F5]">
        <div className="text-center">
          <p className="text-sm text-stone-500">Unable to connect to chat</p>
          <p className="mt-1 text-xs text-stone-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#FAF8F5]">
      <ChatHeader
        otherUserName={otherUserName}
        otherUserAvatar={otherUserAvatar}
        sessionStatus={sessionStatus}
      />

      {!isConnected && (
        <div className="bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-700">
          Reconnecting...
        </div>
      )}

      <MessageList messages={messages} currentIdentity={currentIdentity} />

      <ChatInput
        onSendText={handleSendText}
        onAttachFile={handleAttachFile}
        disabled={!isConnected}
        dictation={dictation}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
